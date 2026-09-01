import test from "node:test";
import assert from "node:assert/strict";
import { diffBasedFeedback } from "../src/lib/pronunciation.ts";

/**
 * 現在の採点の「振る舞いを固定する」テスト。
 *
 * ここに並んでいるのは望ましい仕様ではなく、**いま実際にそうなっている**という記録である。
 * 採点を作り直すとき、これらが落ちることが進歩の証拠になる。
 */

test("語順がめちゃくちゃでも満点になる（集合比較なので順序を見ていない）", () => {
  const target = "The cat sat on the mat";
  const shuffled = "mat the on sat cat The";
  const result = diffBasedFeedback(target, shuffled);
  assert.equal(result.score, 100);
});

test("目標文にない語をいくら足しても減点されない", () => {
  const target = "I went to the station";
  const withJunk = "I went to the station banana banana banana";
  const result = diffBasedFeedback(target, withJunk);
  assert.equal(result.score, 100);
  assert.deepEqual(result.details.added, ["banana"]);
});

test("繰り返しを飛ばしても満点になる（語の有無しか見ていない）", () => {
  const target = "I really really want to go";
  const dropped = "I really want to go";
  const result = diffBasedFeedback(target, dropped);
  assert.equal(result.score, 100);
});

test("採点は音声ではなく認識テキストだけで決まる（同じテキストなら常に同点）", () => {
  const target = "She sells seashells by the seashore";
  // 発音の巧拙にかかわらず、音声認識が同じ文字列を返せば結果は完全に一致する。
  // つまりこの関数には「どう発音したか」を知る手段が原理的に存在しない。
  const a = diffBasedFeedback(target, "She sells seashells by the seashore");
  const b = diffBasedFeedback(target, "She sells seashells by the seashore");
  assert.deepEqual(a, b);
  assert.equal(a.score, 100);
});

test("語が抜けたときだけ点が下がる（＝リスニングの穴しか測れない）", () => {
  const target = "The quick brown fox jumps over the lazy dog";
  const result = diffBasedFeedback(target, "The quick fox jumps the dog");
  assert.ok(result.score < 100);
  assert.deepEqual(result.details.missed, ["brown", "over", "lazy"]);
});

test("空の発話でも例外にはならず0点になる", () => {
  const result = diffBasedFeedback("Hello world", "");
  assert.equal(result.score, 0);
});
