import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { PRACTICE_STEPS, isStepId } from "@/lib/practice-plan";
import {
  scoreMetrics,
  scoreOverlap,
  type Envelope,
  type OverlapMetrics,
  type OverlapResult,
} from "@/lib/overlap";

/** 包絡は10ms刻み。5分ぶんを上限にする（通しの本番録音でも足りる） */
const HOP_MS = 10;
const MAX_FRAMES = 30_000;

/**
 * POST /api/v1/attempts — 練習1回ぶんを記録する。
 *
 * 音声そのものは受け取らない。端末で作ったエネルギー包絡（envelopes）か、
 * 端末で計算済みの指標（metrics）を受け取り、点数はサーバーで同じ式から出す。
 * 採点しないステップ（聞き取り等）は、どちらも省略して「やった」記録だけ残す。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);
    const store = getStore();

    const { materialId, step } = body;
    if (typeof materialId !== "string" || !materialId) {
      throw new ApiError("bad_request", "materialId が必要です");
    }
    if (!isStepId(step)) throw new ApiError("bad_request", "step が不正です");

    const isUserText = materialId.startsWith("text:");
    const exists = isUserText
      ? await store.getText(user.id, materialId.slice(5))
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

    const attempt = await store.insertAttempt(user.id, {
      materialId,
      step,
      sentenceIndex,
      durationMs,
      score: result?.score ?? null,
      lagMs: result?.lagMs ?? null,
      rhythm: result?.rhythm ?? null,
      rateRatio: result?.rateRatio ?? null,
      coverage: result?.coverage ?? null,
    });

    return ok({ attempt, feedback: result?.feedback ?? null }, { status: 201 });
  });
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
