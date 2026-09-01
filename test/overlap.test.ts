import test from "node:test";
import assert from "node:assert/strict";
import {
  computeEnvelope,
  alignmentMetrics,
  scoreOverlap,
  type Envelope,
} from "../src/lib/overlap.ts";

const HOP = 10;

/** [継続ミリ秒, エネルギー] の並びから包絡を作る（0 は無音） */
function env(segments: Array<[number, number]>, hopMs = HOP): Envelope {
  const frames: number[] = [];
  for (const [ms, level] of segments) {
    const n = Math.round(ms / hopMs);
    for (let i = 0; i < n; i++) frames.push(level);
  }
  return { frames, hopMs };
}

/** お手本: 話す→間→話す→間→話す */
const REFERENCE = env([
  [300, 0.9],
  [150, 0],
  [400, 0.8],
  [150, 0],
  [300, 1.0],
]);

test("波形からエネルギー包絡を作れる（無音は0、発話部分は高い）", () => {
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate); // 1秒
  // 0.2秒〜0.6秒だけサイン波を入れる
  for (let i = 0.2 * sampleRate; i < 0.6 * sampleRate; i++) {
    samples[i] = Math.sin((2 * Math.PI * 200 * i) / sampleRate);
  }
  const e = computeEnvelope(samples, sampleRate);
  const at = (sec: number) => e.frames[Math.floor((sec * 1000) / e.hopMs)];

  assert.ok(at(0.05) < 0.1, "無音区間が0になっていない");
  assert.ok(at(0.4) > 0.9, "発話区間が高くなっていない");
  assert.ok(at(0.8) < 0.1, "末尾の無音が0になっていない");
});

test("お手本を300ms遅れでなぞると、遅れ300msとして検出される", () => {
  const user = env([[300, 0], ...REFERENCE.frames.map((v) => [HOP, v] as [number, number])]);
  const m = alignmentMetrics(REFERENCE, user);

  assert.equal(m.lagMs, 300);
  assert.ok(m.rhythm > 0.99, `リズム一致が低い: ${m.rhythm}`);
  assert.ok(m.coverage > 0.99, `カバー率が低い: ${m.coverage}`);
  assert.ok(scoreOverlap(REFERENCE, user).score >= 95);
});

test("倍の速さで喋ると話速比が約0.5になる", () => {
  const fast = env([
    [150, 0.9],
    [75, 0],
    [200, 0.8],
    [75, 0],
    [150, 1.0],
  ]);
  const m = alignmentMetrics(REFERENCE, fast);
  assert.ok(m.rateRatio > 0.4 && m.rateRatio < 0.6, `話速比が想定外: ${m.rateRatio}`);
  assert.ok(scoreOverlap(REFERENCE, fast).feedback.includes("急ぎすぎ"));
});

test("後半で脱落するとカバー率が下がる", () => {
  const dropout = env([
    [300, 0.9],
    [150, 0],
    [400, 0.8],
    [450, 0], // 最後の発話をまるごと落とす
  ]);
  const m = alignmentMetrics(REFERENCE, dropout);
  assert.ok(m.coverage < 0.75, `カバー率が下がっていない: ${m.coverage}`);
  assert.ok(scoreOverlap(REFERENCE, dropout).score < 80);
});

test("リズムが噛み合っていないと点が下がる", () => {
  // 声を出している総量はお手本とほぼ同じだが、山と谷の位置が違う
  const offbeat = env([
    [100, 0.9],
    [300, 0],
    [150, 1.0],
    [100, 0],
    [250, 0.8],
    [100, 0],
    [300, 0.9],
  ]);
  const aligned = env([[300, 0], ...REFERENCE.frames.map((v) => [HOP, v] as [number, number])]);

  const offbeatScore = scoreOverlap(REFERENCE, offbeat).score;
  const alignedScore = scoreOverlap(REFERENCE, aligned).score;

  assert.ok(
    offbeatScore < alignedScore - 15,
    `リズムのズレが点に出ていない (offbeat=${offbeatScore}, aligned=${alignedScore})`,
  );
});

test("無音は0点になり、その旨が返る", () => {
  const silence = env([[1300, 0]]);
  const r = scoreOverlap(REFERENCE, silence);
  assert.equal(r.score, 0);
  assert.match(r.feedback, /声が入っていません/);
});

test("録音レベルが半分でも点数は変わらない（正規化されている）", () => {
  const loud = env([[300, 0], ...REFERENCE.frames.map((v) => [HOP, v] as [number, number])]);
  const quiet = env([
    [300, 0],
    ...REFERENCE.frames.map((v) => [HOP, v * 0.5] as [number, number]),
  ]);
  assert.equal(scoreOverlap(REFERENCE, loud).score, scoreOverlap(REFERENCE, quiet).score);
});

// ---------------------------------------------------------------------------
// お手本側の包絡（TTSの境界イベント / 字幕タイムスタンプから作る）
// ---------------------------------------------------------------------------

test("境界イベントから包絡を作れる（実機で取得した値を使用）", async () => {
  const { envelopeFromBoundaries } = await import("../src/lib/overlap.ts");
  // Chrome の speechSynthesis から実際に取得した値
  const text = "The thing that surprised me most was how little it mattered in the end.";
  const boundaries = [
    { charIndex: 0, elapsedMs: 294 },
    { charIndex: 4, elapsedMs: 441 },
    { charIndex: 10, elapsedMs: 836 },
    { charIndex: 15, elapsedMs: 1050 },
    { charIndex: 25, elapsedMs: 2010 },
    { charIndex: 28, elapsedMs: 2202 },
    { charIndex: 33, elapsedMs: 2681 },
    { charIndex: 37, elapsedMs: 2980 },
    { charIndex: 41, elapsedMs: 3225 },
    { charIndex: 48, elapsedMs: 3823 },
    { charIndex: 51, elapsedMs: 3983 },
    { charIndex: 60, elapsedMs: 4591 },
    { charIndex: 63, elapsedMs: 4783 },
    { charIndex: 67, elapsedMs: 5007 },
    { charIndex: 70, elapsedMs: 5497 },
  ];
  const e = envelopeFromBoundaries(boundaries, text, 5531);

  assert.equal(e.frames.length, 553);
  const voiced = e.frames.filter((v) => v > 0).length;
  assert.ok(voiced > 200, `発話区間が少なすぎる: ${voiced}`);
  assert.ok(voiced < e.frames.length, "全部が発話になっている（間が検出できていない）");
  // 最初の語が始まる前（294ms）は無音のはず
  assert.equal(e.frames[10], 0);
});

test("語の間隔が不自然に広いところは間として無音になる", async () => {
  const { envelopeFromBoundaries } = await import("../src/lib/overlap.ts");
  const text = "one two three four";
  const boundaries = [
    { charIndex: 0, elapsedMs: 0 },
    { charIndex: 4, elapsedMs: 300 },
    { charIndex: 8, elapsedMs: 600 },
    // ここだけ2秒空ける（3語ぶんの間隔なのに間が異常に広い）
    { charIndex: 14, elapsedMs: 2600 },
  ];
  const e = envelopeFromBoundaries(boundaries, text, 3000);
  // "three" のあとに無音が現れる
  const gapFrames = e.frames.slice(120, 250).filter((v) => v === 0).length;
  assert.ok(gapFrames > 80, `間が無音になっていない: ${gapFrames}`);
});

test("境界イベントが取れなかった場合は無音の包絡を返す（例外にしない）", async () => {
  const { envelopeFromBoundaries } = await import("../src/lib/overlap.ts");
  const e = envelopeFromBoundaries([], "hello", 1000);
  assert.equal(e.frames.length, 100);
  assert.ok(e.frames.every((v) => v === 0));
});
