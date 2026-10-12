/**
 * 1日の練習メニューと教材の割り当て。
 *
 * シャドテンの学習サイクルを、人の添削なしで回せる形に置き換えたもの。
 *
 *   シャドテン                         このアプリ
 *   ─────────────────────────────    ─────────────────────────────────
 *   1教材を約1週間かけて練習             同じ（習得するか7日経つまで同じ教材）
 *   リスニング→スクリプト→オーバーラッピング   同じ6ステップ（PRACTICE_STEPS）
 *     →シャドーイング→録音提出
 *   プロが毎日録音を添削                本番録音を「重なり」で即時採点し、
 *                                     弱い文をスクリプト上に印として返す
 *   面談でレベルを調整                  直近の本番スコアから自動で上げ下げ
 *
 * ブラウザにもNodeにも依存しない純関数だけを置く（iOSのAPIとWebで共有する）。
 */

export type Level = "beginner" | "intermediate" | "advanced";
export const LEVELS: readonly Level[] = ["beginner", "intermediate", "advanced"];

export type StepId =
  | "listen"
  | "script"
  | "mumbling"
  | "overlapping"
  | "shadowing"
  | "record";

export interface PracticeStep {
  id: StepId;
  title: string;
  instruction: string;
  /** 目安の所要時間（分） */
  minutes: number;
  /** このステップで「重なり」採点をするか */
  scored: boolean;
}

export const PRACTICE_STEPS: readonly PracticeStep[] = [
  {
    id: "listen",
    title: "聞き取り",
    instruction: "スクリプトを見ずに2回聞き、何の話か掴みます。",
    minutes: 3,
    scored: false,
  },
  {
    id: "script",
    title: "スクリプト確認",
    instruction: "スクリプトと訳を読み、聞き取れなかった所と意味を確認します。",
    minutes: 5,
    scored: false,
  },
  {
    id: "mumbling",
    title: "マンブリング",
    instruction: "スクリプトを見ずに、小声でお手本の音とリズムだけをなぞります。",
    minutes: 4,
    scored: false,
  },
  {
    id: "overlapping",
    title: "オーバーラッピング",
    instruction: "スクリプトを見ながら、お手本と同時に声を重ねます。",
    minutes: 6,
    scored: true,
  },
  {
    id: "shadowing",
    title: "シャドーイング",
    instruction: "スクリプトを見ずに、少し遅れてお手本を追いかけます。",
    minutes: 8,
    scored: true,
  },
  {
    id: "record",
    title: "本番録音",
    instruction: "通しで1回シャドーイングし、今日の記録として残します。",
    minutes: 4,
    scored: true,
  },
];

export function isStepId(value: unknown): value is StepId {
  return PRACTICE_STEPS.some((s) => s.id === value);
}

export function isLevel(value: unknown): value is Level {
  return LEVELS.includes(value as Level);
}

/** 教材をこの点数以上で本番録音できたら「習得」として次へ進む */
export const MASTERY_SCORE = 85;
/** 習得できなくても、この日数が経てば次の教材へ（シャドテンの1週間サイクル） */
export const MAX_DAYS_PER_MATERIAL = 7;

export interface AttemptLike {
  materialId: string;
  step: StepId;
  score: number | null;
  /** 文ごとの採点なら何文目か。通しなら null */
  sentenceIndex: number | null;
  /** ISO 8601 */
  createdAt: string;
}

export interface AssignmentLike {
  materialId: string;
  /** YYYY-MM-DD（利用者のタイムゾーンでの日付） */
  startedOn: string;
}

export interface MaterialSummary {
  id: string;
  level: Level;
}

// ---------------------------------------------------------------------------
// 日付
// ---------------------------------------------------------------------------

/** ISO日時を、指定タイムゾーンでの YYYY-MM-DD にする */
export function localDate(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // en-CA は YYYY-MM-DD 形式で出る
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 今日のメニュー
// ---------------------------------------------------------------------------

export interface TodayStep extends PracticeStep {
  done: boolean;
  /** このステップの今日の最高点（未採点・未実施なら null） */
  bestScore: number | null;
}

export interface TodayPlan {
  materialId: string;
  /** この教材の何日目か（1始まり） */
  day: number;
  steps: TodayStep[];
  /** 次にやるべきステップ。全部終わっていれば null */
  nextStep: StepId | null;
  /** 今日の本番録音の最高点 */
  todayRecordScore: number | null;
}

/**
 * 今日の練習メニューを組み立てる。
 * 今日（利用者のタイムゾーン）に記録があるステップを完了扱いにする。
 */
export function buildTodayPlan(
  assignment: AssignmentLike,
  attempts: AttemptLike[],
  now: Date,
  timeZone: string,
): TodayPlan {
  const today = localDate(now, timeZone);
  const todays = attempts.filter(
    (a) =>
      a.materialId === assignment.materialId &&
      localDate(a.createdAt, timeZone) === today,
  );

  const steps: TodayStep[] = PRACTICE_STEPS.map((step) => {
    const mine = todays.filter((a) => a.step === step.id);
    const scores = mine.map((a) => a.score).filter((s): s is number => s !== null);
    return {
      ...step,
      done: mine.length > 0,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
    };
  });

  const recordStep = steps.find((s) => s.id === "record")!;
  return {
    materialId: assignment.materialId,
    day: daysBetween(assignment.startedOn, today) + 1,
    steps,
    nextStep: steps.find((s) => !s.done)?.id ?? null,
    todayRecordScore: recordStep.bestScore,
  };
}

// ---------------------------------------------------------------------------
// 教材の割り当て
// ---------------------------------------------------------------------------

/** この教材の本番録音（通し）の最高点 */
function bestRecordScore(materialId: string, attempts: AttemptLike[]): number | null {
  const scores = attempts
    .filter(
      (a) =>
        a.materialId === materialId &&
        a.step === "record" &&
        a.sentenceIndex === null &&
        a.score !== null,
    )
    .map((a) => a.score as number);
  return scores.length > 0 ? Math.max(...scores) : null;
}

export type AssignmentDecision =
  | { action: "keep" }
  | { action: "advance"; reason: "mastered" | "expired" | "none"; materialId: string; level: Level }
  | { action: "exhausted" };

/**
 * 今の教材を続けるか、次の教材に進むかを決める。
 *
 * - 本番録音で MASTERY_SCORE 以上を取れたら、翌日から次へ（当日は続けられる）
 * - 取れなくても MAX_DAYS_PER_MATERIAL 日経ったら次へ
 * - 次の教材は、レベル調整後のレベルから、まだやっていないものを選ぶ
 */
export function decideAssignment(input: {
  current: AssignmentLike | null;
  level: Level;
  attempts: AttemptLike[];
  materials: MaterialSummary[];
  now: Date;
  timeZone: string;
}): AssignmentDecision {
  const { current, attempts, materials, now, timeZone } = input;
  const today = localDate(now, timeZone);

  let reason: "mastered" | "expired" | "none" = "none";
  if (current) {
    const masteredBeforeToday = attempts.some(
      (a) =>
        a.materialId === current.materialId &&
        a.step === "record" &&
        a.sentenceIndex === null &&
        (a.score ?? 0) >= MASTERY_SCORE &&
        localDate(a.createdAt, timeZone) < today,
    );
    const elapsed = daysBetween(current.startedOn, today);
    if (masteredBeforeToday) reason = "mastered";
    else if (elapsed >= MAX_DAYS_PER_MATERIAL) reason = "expired";
    else return { action: "keep" };
  }

  const level = current
    ? adjustLevel(input.level, bestRecordScore(current.materialId, attempts), reason)
    : input.level;

  const practiced = new Set(attempts.map((a) => a.materialId));
  if (current) practiced.add(current.materialId);

  // 同じレベル → 近いレベルの順に、まだやっていない教材を探す
  const order = [...LEVELS].sort(
    (a, b) => Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(level)) -
      Math.abs(LEVELS.indexOf(b) - LEVELS.indexOf(level)),
  );
  for (const lv of order) {
    const next = materials.find((m) => m.level === lv && !practiced.has(m.id));
    if (next) return { action: "advance", reason, materialId: next.id, level };
  }
  return { action: "exhausted" };
}

/**
 * 教材を終えたときのレベル調整。
 * 早く習得できたら1つ上げ、期限切れで本番スコアが低ければ1つ下げる。
 */
export function adjustLevel(
  level: Level,
  bestScore: number | null,
  reason: "mastered" | "expired" | "none",
): Level {
  const i = LEVELS.indexOf(level);
  if (reason === "mastered" && (bestScore ?? 0) >= 92) {
    return LEVELS[Math.min(LEVELS.length - 1, i + 1)];
  }
  if (reason === "expired" && (bestScore ?? 0) < 60) {
    return LEVELS[Math.max(0, i - 1)];
  }
  return level;
}

// ---------------------------------------------------------------------------
// 進捗
// ---------------------------------------------------------------------------

/**
 * 連続練習日数。今日まだ練習していなくても、昨日まで続いていれば途切れていない扱い
 * （朝の時点で streak が 0 に見えると、続ける動機を削ぐため）。
 */
export function computeStreak(attempts: AttemptLike[], now: Date, timeZone: string): number {
  const days = new Set(attempts.map((a) => localDate(a.createdAt, timeZone)));
  const today = localDate(now, timeZone);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface WeakSentence {
  sentenceIndex: number;
  averageScore: number;
  attempts: number;
}

/**
 * 文ごとの採点から、重ねられていない文を弱い順に返す。
 * シャドテンでプロがスクリプトに付ける「ここが言えていない」の印の代わり。
 */
export function weakSentences(
  materialId: string,
  attempts: AttemptLike[],
  { limit = 3, threshold = 70 } = {},
): WeakSentence[] {
  const bySentence = new Map<number, number[]>();
  for (const a of attempts) {
    if (a.materialId !== materialId || a.sentenceIndex === null || a.score === null) continue;
    const list = bySentence.get(a.sentenceIndex) ?? [];
    list.push(a.score);
    bySentence.set(a.sentenceIndex, list);
  }
  return [...bySentence.entries()]
    .map(([sentenceIndex, scores]) => ({
      sentenceIndex,
      averageScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      attempts: scores.length,
    }))
    .filter((w) => w.averageScore < threshold)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, limit);
}

export interface DailySummary {
  date: string;
  attempts: number;
  bestRecordScore: number | null;
}

/** 直近 days 日の日別サマリ（古い順）。練習のない日も 0 件として含める */
export function dailyHistory(
  attempts: AttemptLike[],
  now: Date,
  timeZone: string,
  days = 14,
): DailySummary[] {
  const today = localDate(now, timeZone);
  const result: DailySummary[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const mine = attempts.filter((a) => localDate(a.createdAt, timeZone) === date);
    const records = mine
      .filter((a) => a.step === "record" && a.sentenceIndex === null && a.score !== null)
      .map((a) => a.score as number);
    result.push({
      date,
      attempts: mine.length,
      bestRecordScore: records.length > 0 ? Math.max(...records) : null,
    });
  }
  return result;
}
