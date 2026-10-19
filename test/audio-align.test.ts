import test from "node:test";
import assert from "node:assert/strict";
import { alignSentences, findPauses, splitIntoParts } from "../src/lib/audio-align.ts";
import { sliceEnvelope, stretchEnvelope, type Envelope } from "../src/lib/overlap.ts";

const HOP = 10;

/** [継続ミリ秒, エネルギー] の並びから包絡を作る */
function env(segments: Array<[number, number]>): Envelope {
  const frames: number[] = [];
  for (const [ms, level] of segments) for (let i = 0; i < ms / HOP; i++) frames.push(level);
  return { frames, hopMs: HOP };
}

test("150ms 以上の無音を間として見つける", () => {
  const pauses = findPauses(env([[500, 0.8], [100, 0], [500, 0.8], [400, 0], [500, 0.8]]));
  assert.deepEqual(pauses, [{ startMs: 1100, endMs: 1500 }]);
});

test("文末の長い間で切り、読点の短い間では切らない", () => {
  // 文1（長い）: 声 1500 / 読点の間 200 / 声 1500 → 文末の間 800 → 文2（短い）: 声 1500 → 間 800 → 文3: 声 1500
  const e = env([
    [300, 0],
    [1500, 0.9], [200, 0], [1500, 0.9],
    [800, 0],
    [1500, 0.9],
    [800, 0],
    [1500, 0.9],
    [500, 0],
  ]);
  const sentences = [
    "This first sentence is clearly long, and it has a comma in the middle of it.",
    "The second one is short here.",
    "The third one is short as well.",
  ];
  const r = alignSentences(e, sentences)!;
  assert.equal(r.timings.length, 3);
  // 文2は 4300ms（文1の後の間の終わり）付近から始まる
  assert.ok(Math.abs(r.timings[1].startMs - 4300) <= 100, `start ${r.timings[1].startMs}`);
  assert.ok(Math.abs(r.timings[2].startMs - 6600) <= 100, `start ${r.timings[2].startMs}`);
  assert.equal(r.confidence, 1);
});

test("末尾の署名を除いて合わせる", () => {
  const e = env([
    [1500, 0.9], [800, 0],
    [1500, 0.9], [800, 0],
    [600, 0.9], // "I'm John Russell."
    [300, 0],
  ]);
  const r = alignSentences(e, ["Here is the first sentence of it.", "And here is the second one too."], {
    trailingSignature: true,
  })!;
  assert.ok(Math.abs(r.timings[1].endMs - 3800 - 150) <= 20, `end ${r.timings[1].endMs}`);
});

test("約1分ごとのパートに分け、短すぎる最後のパートは前にまとめる", () => {
  const timings = Array.from({ length: 13 }, (_, i) => ({ startMs: i * 10_000, endMs: i * 10_000 + 9_000 }));
  const parts = splitIntoParts(timings, { targetMs: 60_000 });
  assert.deepEqual(parts.map((p) => [p.from, p.to]), [[0, 7], [7, 13]]);
});

test("包絡の切り出しは範囲内で正規化し直し、速度に合わせて伸ばす", () => {
  const e = env([[100, 1], [100, 0.5]]);
  const sliced = sliceEnvelope(e, 100, 200);
  assert.deepEqual(sliced.frames, Array(10).fill(1));
  assert.equal(stretchEnvelope(e, 0.5).frames.length, 40);
});
