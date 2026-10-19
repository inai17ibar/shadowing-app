import test from "node:test";
import assert from "node:assert/strict";
import {
  checkSoundChanges,
  findSoundChanges,
  soundChangeFeedback,
} from "../src/lib/sound-changes.ts";
import type { Envelope, WordBoundary } from "../src/lib/overlap.ts";

function kinds(text: string) {
  return findSoundChanges(text).map((c) => `${c.kind}:${c.label}`);
}

test("子音で終わる語と母音で始まる語は連結", () => {
  assert.deepEqual(kinds("Check it out"), ["linking:Check‿it", "linking:it‿out"]);
  assert.deepEqual(kinds("Take it easy"), ["linking:Take‿it", "linking:it‿easy"]);
});

test("t / d / s + you は同化", () => {
  assert.deepEqual(kinds("Nice to meet you"), ["assimilation:meet‿you"]);
  assert.match(findSoundChanges("Did you see it")[0].hint, /ジュ/);
  assert.match(findSoundChanges("Miss you")[0].hint, /シュ/);
  assert.match(findSoundChanges("as you know")[0].hint, /ジュ/);
  assert.deepEqual(kinds("Don't you"), ["assimilation:Don't‿you"]);
});

test("語末の破裂音の後に子音が続くと脱落", () => {
  assert.deepEqual(kinds("Good morning"), ["elision:Good‿morning"]);
  assert.deepEqual(kinds("a big game"), ["elision:big‿game"]);
});

test("him / her / his は h が落ちて連結", () => {
  assert.deepEqual(kinds("Tell him"), ["linking:Tell‿him"]);
});

test("綴りが母音でも子音で始まる語・句読点の後は扱わない", () => {
  assert.deepEqual(kinds("a useful one"), []);
  assert.deepEqual(kinds("Wait, and see"), ["elision:and‿see"]);
  assert.deepEqual(kinds("an hour"), ["linking:an‿hour"]);
});

// --- 録音での判定 ---------------------------------------------------------

const HOP = 10;

function frames(segments: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (const [ms, level] of segments) for (let i = 0; i < ms / HOP; i++) out.push(level);
  return out;
}

// "Check it out" の語の開始: Check 0ms / it 400ms / out 700ms
const TEXT = "Check it out";
const BOUNDARIES: WordBoundary[] = [
  { charIndex: 0, elapsedMs: 0 },
  { charIndex: 6, elapsedMs: 400 },
  { charIndex: 9, elapsedMs: 700 },
];
const REFERENCE: Envelope = { frames: frames([[1100, 1], [500, 0]]), hopMs: HOP };

test("つなげて言えていれば linked", () => {
  const user: Envelope = { frames: frames([[1100, 0.8], [500, 0]]), hopMs: HOP };
  const checks = checkSoundChanges(TEXT, BOUNDARIES, REFERENCE, user, 0);
  assert.deepEqual(checks.map((c) => c.result), ["linked", "linked"]);
  assert.match(soundChangeFeedback(checks) ?? "", /途切れずに/);
});

test("語の間で間が空いていれば broken として指摘する", () => {
  // Check と it の間で 250ms 止まった（it の開始 400ms の前後）
  const user: Envelope = {
    frames: frames([[300, 0.8], [250, 0], [550, 0.8], [500, 0]]),
    hopMs: HOP,
  };
  const checks = checkSoundChanges(TEXT, BOUNDARIES, REFERENCE, user, 0);
  assert.equal(checks[0].result, "broken");
  assert.ok(checks[0].gapMs >= 160);
  assert.match(soundChangeFeedback(checks) ?? "", /Check‿it で音が途切れています/);
});

test("その辺りで声を出していなければ判定しない", () => {
  const user: Envelope = { frames: frames([[1600, 0]]), hopMs: HOP };
  const checks = checkSoundChanges(TEXT, BOUNDARIES, REFERENCE, user, 0);
  assert.deepEqual(checks.map((c) => c.result), ["unknown", "unknown"]);
  assert.equal(soundChangeFeedback(checks), null);
});
