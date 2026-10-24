import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTodayPlan,
  decideAssignment,
  adjustLevel,
  computeStreak,
  weakSentences,
  dailyHistory,
  localDate,
  type AttemptLike,
} from "../src/lib/practice-plan.ts";

const TZ = "Asia/Tokyo";
// 2026-10-12 10:00 JST
const NOW = new Date("2026-10-12T01:00:00Z");

function attempt(partial: Partial<AttemptLike>): AttemptLike {
  return {
    materialId: "m1",
    step: "record",
    score: null,
    sentenceIndex: null,
    createdAt: NOW.toISOString(),
    ...partial,
  };
}

const MATERIALS = [
  { id: "m1", level: "beginner" as const },
  { id: "m2", level: "beginner" as const },
  { id: "m3", level: "intermediate" as const },
  { id: "m4", level: "advanced" as const },
];

test("日付は利用者のタイムゾーンで数える（UTCでは前日でもJSTでは当日）", () => {
  assert.equal(localDate("2026-10-11T16:00:00Z", TZ), "2026-10-12");
  assert.equal(localDate("2026-10-11T16:00:00Z", "UTC"), "2026-10-11");
});

test("今日のメニュー: 記録のあるステップが完了になり、次のステップが示される", () => {
  const plan = buildTodayPlan(
    { materialId: "m1", startedOn: "2026-10-10" },
    [
      attempt({ step: "listen" }),
      attempt({ step: "script" }),
      attempt({ step: "overlapping", score: 60 }),
      attempt({ step: "overlapping", score: 72 }),
      // 昨日の記録は今日の完了に数えない
      attempt({ step: "mumbling", createdAt: "2026-10-11T01:00:00Z" }),
    ],
    NOW,
    TZ,
  );
  assert.equal(plan.day, 3);
  assert.equal(plan.nextStep, "mumbling");
  const overlapping = plan.steps.find((s) => s.id === "overlapping")!;
  assert.equal(overlapping.done, true);
  assert.equal(overlapping.bestScore, 72);
  assert.equal(plan.todayRecordScore, null);
});

test("割り当て: 初回は自分のレベルの未練習教材が選ばれる", () => {
  const d = decideAssignment({
    current: null, level: "beginner", attempts: [], materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.deepEqual(d, { action: "advance", reason: "none", materialId: "m1", level: "beginner" });
});

test("割り当て: 習得していない・7日未満なら同じ教材を続ける", () => {
  const d = decideAssignment({
    current: { materialId: "m1", startedOn: "2026-10-09" },
    level: "beginner",
    attempts: [attempt({ score: 70, createdAt: "2026-10-11T01:00:00Z" })],
    materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.deepEqual(d, { action: "keep" });
});

test("割り当て: 習得した当日はそのまま、翌日に次の教材へ進む", () => {
  const mastered = attempt({ score: 88 });
  const sameDay = decideAssignment({
    current: { materialId: "m1", startedOn: "2026-10-10" },
    level: "beginner", attempts: [mastered], materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.deepEqual(sameDay, { action: "keep" });

  const nextDay = decideAssignment({
    current: { materialId: "m1", startedOn: "2026-10-10" },
    level: "beginner", attempts: [mastered], materials: MATERIALS,
    now: new Date("2026-10-13T01:00:00Z"), timeZone: TZ,
  });
  assert.deepEqual(nextDay, { action: "advance", reason: "mastered", materialId: "m2", level: "beginner" });
});

test("割り当て: 7日経ったら習得していなくても次へ進む", () => {
  const d = decideAssignment({
    current: { materialId: "m1", startedOn: "2026-10-05" },
    level: "beginner",
    attempts: [attempt({ score: 75, createdAt: "2026-10-06T01:00:00Z" })],
    materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.equal(d.action, "advance");
  assert.equal(d.action === "advance" && d.reason, "expired");
});

test("割り当て: 高得点で習得したらレベルが上がり、上のレベルの教材が選ばれる", () => {
  const d = decideAssignment({
    current: { materialId: "m1", startedOn: "2026-10-10" },
    level: "beginner",
    attempts: [attempt({ score: 95, createdAt: "2026-10-11T01:00:00Z" })],
    materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.deepEqual(d, { action: "advance", reason: "mastered", materialId: "m3", level: "intermediate" });
});

test("割り当て: 同じレベルが尽きたら近いレベルから選び、全部尽きたら exhausted", () => {
  const done = MATERIALS.map((m) => attempt({ materialId: m.id, step: "listen" }));
  const d = decideAssignment({
    current: null, level: "beginner", attempts: done.slice(0, 2), materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.equal(d.action === "advance" && d.materialId, "m3");

  const none = decideAssignment({
    current: null, level: "beginner", attempts: done, materials: MATERIALS, now: NOW, timeZone: TZ,
  });
  assert.deepEqual(none, { action: "exhausted" });
});

test("レベル調整: 期限切れで低得点なら下げる。端では止まる", () => {
  assert.equal(adjustLevel("intermediate", 50, "expired"), "beginner");
  assert.equal(adjustLevel("beginner", 50, "expired"), "beginner");
  assert.equal(adjustLevel("advanced", 99, "mastered"), "advanced");
  assert.equal(adjustLevel("intermediate", 86, "mastered"), "intermediate");
});

test("連続日数: 今日まだ練習していなくても昨日まで続いていれば途切れない", () => {
  const attempts = [
    attempt({ createdAt: "2026-10-09T01:00:00Z" }),
    attempt({ createdAt: "2026-10-10T01:00:00Z" }),
    attempt({ createdAt: "2026-10-11T01:00:00Z" }),
  ];
  assert.equal(computeStreak(attempts, NOW, TZ), 3);
  assert.equal(computeStreak([...attempts, attempt({})], NOW, TZ), 4);
  // 一昨日で止まっていれば 0
  assert.equal(computeStreak(attempts.slice(0, 2), NOW, TZ), 0);
});

test("弱い文: 文ごとの平均点が低い順に、閾値未満だけを返す", () => {
  const attempts = [
    attempt({ step: "shadowing", sentenceIndex: 0, score: 90 }),
    attempt({ step: "shadowing", sentenceIndex: 1, score: 40 }),
    attempt({ step: "shadowing", sentenceIndex: 1, score: 60 }),
    attempt({ step: "shadowing", sentenceIndex: 2, score: 65 }),
    attempt({ materialId: "other", step: "shadowing", sentenceIndex: 3, score: 10 }),
  ];
  assert.deepEqual(weakSentences("m1", attempts), [
    { sentenceIndex: 1, averageScore: 50, attempts: 2 },
    { sentenceIndex: 2, averageScore: 65, attempts: 1 },
  ]);
});

test("日別履歴: 練習のない日も含めて古い順に並ぶ", () => {
  const h = dailyHistory(
    [attempt({ score: 80 }), attempt({ score: 70, createdAt: "2026-10-10T01:00:00Z" })],
    NOW, TZ, 3,
  );
  assert.deepEqual(h, [
    { date: "2026-10-10", attempts: 1, bestRecordScore: 70 },
    { date: "2026-10-11", attempts: 0, bestRecordScore: null },
    { date: "2026-10-12", attempts: 1, bestRecordScore: 80 },
  ]);
});
