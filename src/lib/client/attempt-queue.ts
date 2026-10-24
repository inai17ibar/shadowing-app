/**
 * 練習記録の送信（Web版）。通信できないときは端末（localStorage）に溜め、
 * 次に通信できたときに POST /attempts/batch でまとめて送る。iOS のオフライン練習と同じ仕組み。
 *
 * 記録には端末で UUID を振るので、同じものを何度送っても二重にならない。
 */
import { api, ApiClientError, NetworkError } from "./api";

const KEY = "shadowing.pendingAttempts";
const BATCH = 100;

export interface AttemptPayload {
  materialId: string;
  step: string;
  sentenceIndex?: number;
  durationMs?: number;
  envelopes?: { reference: { frames: number[]; hopMs: number }; user: { frames: number[]; hopMs: number } };
  metrics?: { lagMs: number; rhythm: number; rateRatio: number; coverage: number };
}

type Pending = AttemptPayload & { id: string; practicedAt: string };

export interface AttemptResult {
  attempt: { id: string; score: number | null; lagMs: number | null; rhythm: number | null; rateRatio: number | null; coverage: number | null };
  feedback: string | null;
  duplicate: boolean;
}

function load(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}

function save(items: Pending[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できない環境（プライベートモード等）では溜めずに諦める
  }
}

export function pendingCount(): number {
  return load().length;
}

/**
 * 練習1回ぶんを送る。オフラインなら溜めて null を返す（あとで flushPending が送る）。
 */
export async function recordAttempt(payload: AttemptPayload): Promise<AttemptResult | null> {
  const item: Pending = { ...payload, id: crypto.randomUUID(), practicedAt: new Date().toISOString() };
  try {
    return await api<AttemptResult>("POST", "/attempts", item);
  } catch (err) {
    if (err instanceof NetworkError) {
      save([...load(), item]);
      return null;
    }
    throw err;
  }
}

/** 溜めた記録をまとめて送る。送れた（または送っても無駄な）ものは消す。残った件数を返す */
export async function flushPending(): Promise<number> {
  let items = load();
  while (items.length > 0) {
    const chunk = items.slice(0, BATCH);
    let results: { index: number; status: string }[];
    try {
      ({ results } = await api<{ results: { index: number; status: string }[] }>("POST", "/attempts/batch", {
        attempts: chunk,
      }));
    } catch (err) {
      if (err instanceof NetworkError || err instanceof ApiClientError) break;
      throw err;
    }
    const retry: Pending[] = [];
    for (const r of results) {
      // conflict は id を振り直して次回送る。created / duplicate / rejected は送信待ちから外す
      if (r.status === "conflict") retry.push({ ...chunk[r.index], id: crypto.randomUUID() });
    }
    items = [...items.slice(BATCH), ...retry];
    save(items);
    if (retry.length === chunk.length) break;
  }
  return items.length;
}
