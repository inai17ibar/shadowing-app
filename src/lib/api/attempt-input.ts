/**
 * 練習記録の入力検証と採点。POST /attempts（1件）と /attempts/batch（オフライン分の一括送信）で共有する。
 */
import { ApiError } from "./http";
import { PRACTICE_STEPS, isStepId } from "@/lib/practice-plan";
import {
  scoreMetrics,
  scoreOverlap,
  type Envelope,
  type OverlapMetrics,
  type OverlapResult,
} from "@/lib/overlap";
import type { AttemptInput, Store } from "@/lib/db/store";

/** 包絡は10ms刻み。5分ぶんを上限にする（通しの本番録音でも足りる） */
const HOP_MS = 10;
const MAX_FRAMES = 30_000;
/** オフラインで記録したものを受け付ける期間。これより古い練習時刻は不正とみなす */
export const MAX_OFFLINE_DAYS = 30;
/** 端末の時計が進んでいる分の許容 */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedAttempt {
  input: AttemptInput;
  feedback: string | null;
}

/**
 * リクエストの1件ぶんを検証して、保存できる形にする。
 *
 * - id: 端末が作る UUID。同じ id の再送は二重に保存されない。省略時はサーバーが作る
 * - practicedAt: 練習した時刻。オフラインで練習した分は、送信時刻ではなくこちらで日付を数える
 */
export async function parseAttempt(
  store: Store,
  userId: string,
  body: Record<string, unknown>,
  now = new Date(),
): Promise<ParsedAttempt> {
  let id: string;
  if (body.id === undefined) {
    id = crypto.randomUUID();
  } else if (typeof body.id === "string" && UUID_RE.test(body.id)) {
    id = body.id.toLowerCase();
  } else {
    throw new ApiError("bad_request", "id は UUID です");
  }

  let createdAt = now.toISOString();
  if (body.practicedAt !== undefined) {
    const t = typeof body.practicedAt === "string" ? Date.parse(body.practicedAt) : NaN;
    if (Number.isNaN(t)) throw new ApiError("bad_request", "practicedAt は ISO 8601 の日時です");
    if (t > now.getTime() + MAX_CLOCK_SKEW_MS) {
      throw new ApiError("bad_request", "practicedAt が未来の時刻です。端末の時計を確認してください");
    }
    if (t < now.getTime() - MAX_OFFLINE_DAYS * 86_400_000) {
      throw new ApiError("unprocessable", `${MAX_OFFLINE_DAYS}日より前の練習は記録できません`);
    }
    createdAt = new Date(t).toISOString();
  }

  const { materialId, step } = body;
  if (typeof materialId !== "string" || !materialId) {
    throw new ApiError("bad_request", "materialId が必要です");
  }
  if (!isStepId(step)) throw new ApiError("bad_request", "step が不正です");

  const exists = materialId.startsWith("text:")
    ? await store.getText(userId, materialId.slice(5))
    : await store.getMaterial(materialId);
  if (!exists) throw new ApiError("not_found", "教材が見つかりません");

  const sentenceIndex = optionalInt(body.sentenceIndex, "sentenceIndex", 0, 10_000);
  const durationMs = optionalInt(body.durationMs, "durationMs", 0, 3_600_000);

  let result: OverlapResult | null = null;
  if (body.envelopes !== undefined) {
    const e = body.envelopes as { reference?: unknown; user?: unknown };
    result = scoreOverlap(parseEnvelope(e?.reference, "reference"), parseEnvelope(e?.user, "user"));
  } else if (body.metrics !== undefined) {
    result = scoreMetrics(parseMetrics(body.metrics));
  }

  const scored = PRACTICE_STEPS.find((s) => s.id === step)!.scored;
  if (scored && !result) {
    throw new ApiError("bad_request", `${step} は採点するステップです。envelopes か metrics を送ってください`);
  }

  return {
    input: {
      id,
      materialId,
      step,
      sentenceIndex,
      durationMs,
      score: result?.score ?? null,
      lagMs: result?.lagMs ?? null,
      rhythm: result?.rhythm ?? null,
      rateRatio: result?.rateRatio ?? null,
      coverage: result?.coverage ?? null,
      createdAt,
    },
    feedback: result?.feedback ?? null,
  };
}

function optionalInt(v: unknown, name: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new ApiError("bad_request", `${name} は${min}〜${max}の整数です`);
  }
  return v;
}

function parseEnvelope(v: unknown, name: string): Envelope {
  const e = v as { frames?: unknown; hopMs?: unknown } | undefined;
  if (!e || e.hopMs !== HOP_MS) {
    throw new ApiError("bad_request", `envelopes.${name}.hopMs は ${HOP_MS} です`);
  }
  const frames = e.frames;
  if (
    !Array.isArray(frames) ||
    frames.length === 0 ||
    frames.length > MAX_FRAMES ||
    !frames.every((x) => typeof x === "number" && x >= 0 && x <= 1)
  ) {
    throw new ApiError(
      "bad_request",
      `envelopes.${name}.frames は 0..1 の数値の配列（1〜${MAX_FRAMES}個）です`,
    );
  }
  return { frames: frames as number[], hopMs: HOP_MS };
}

function parseMetrics(v: unknown): OverlapMetrics {
  const m = v as Record<string, unknown> | null;
  const num = (k: string, min: number, max: number) => {
    const x = m?.[k];
    if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) {
      throw new ApiError("bad_request", `metrics.${k} は${min}〜${max}の数値です`);
    }
    return x;
  };
  return {
    lagMs: num("lagMs", -5000, 10_000),
    rhythm: num("rhythm", 0, 1),
    rateRatio: num("rateRatio", 0, 10),
    coverage: num("coverage", 0, 1),
  };
}
