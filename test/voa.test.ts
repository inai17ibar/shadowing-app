import test from "node:test";
import assert from "node:assert/strict";
import { buildVoaMaterials, materialInsertSql, parseArticle, parseListing } from "../src/lib/voa.ts";
import { parseRange } from "../src/lib/media.ts";

const ARTICLE = `<html><head>
<meta content="Total Lunar Eclipse" property="og:title">
<meta content="The moon will turn red." property="og:description">
</head><body>
<time pubdate="pubdate" datetime="2025-03-10T12:00:00&#x2B;00:00"></time>
<div class="c-mmp__player"><audio src="https://voa-audio.voanews.eu/vle/2025/03/10/abc.mp3"></audio></div>
<div class="wsw">
<p>A total lunar eclipse will happen this week.</p>
<p>The moon will look red for about an hour. People in the Americas can see it.</p>
<p>I’m Dan Novak.</p>
<p>Some information for this story came from The Associated Press.</p>
</div></body></html>`;

test("記事の本文は署名までで、音声・日付・題名を取り出す", () => {
  const a = parseArticle(ARTICLE, "https://learningenglish.voanews.com/a/total-lunar-eclipse/8005741.html");
  assert.equal(a.articleId, "8005741");
  assert.equal(a.title, "Total Lunar Eclipse");
  assert.equal(a.audioUrl, "https://voa-audio.voanews.eu/vle/2025/03/10/abc.mp3");
  assert.equal(a.publishedAt, "2025-03-10T12:00:00.000Z");
  assert.equal(a.paragraphs.length, 2);
  assert.match(a.trailer[0], /Associated Press/);
});

test("通信社のクレジットは署名の後ろにあってもレビューの注意事項に残す", () => {
  const a = parseArticle(ARTICLE, "https://learningenglish.voanews.com/a/x/8005741.html");
  const sentences = ["A total lunar eclipse will happen this week.", "The moon will look red for about an hour."];
  const timings = [{ startMs: 500, endMs: 3000 }, { startMs: 3800, endMs: 6000 }];
  const [row] = buildVoaMaterials(a, sentences, timings, [{ from: 0, to: 2, startMs: 500, endMs: 6000 }], { confidence: 0.9 });
  assert.equal(row.id, "voa-le-8005741");
  assert.equal(row.status, "pending_review");
  assert.equal(row.audioUrl, "/media/voa/8005741.mp3");
  assert.deepEqual(row.sentences[1], { text: sentences[1], startMs: 3300, endMs: 5500 });
  assert.ok(row.reviewNotes.some((n) => n.includes("AP")));
  assert.match(materialInsertSql(row), /ON CONFLICT \(id\) DO NOTHING;$/);
});

test("一覧から記事URLだけを重複なく取り出す", () => {
  const html = `<a href="/a/one/1.html">1</a><a href="/a/one/1.html">1</a><a href="/z/1579">z</a><a href="/a/two/2.html">2</a>`;
  assert.deepEqual(parseListing(html), [
    "https://learningenglish.voanews.com/a/one/1.html",
    "https://learningenglish.voanews.com/a/two/2.html",
  ]);
});

test("Range ヘッダーを読む", () => {
  assert.deepEqual(parseRange("bytes=0-99"), { offset: 0, length: 100 });
  assert.deepEqual(parseRange("bytes=100-"), { offset: 100 });
  assert.deepEqual(parseRange("bytes=-500"), { suffix: 500 });
  assert.equal(parseRange("bytes=0-1,5-9"), null);
  assert.equal(parseRange(null), null);
});
