import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  materialIdFor,
  cleanArticleParagraphs,
  toCandidate,
  type FeedSource,
} from "../src/lib/collect.ts";

const SOURCE: FeedSource = {
  id: "voa-le",
  name: "VOA Learning English",
  feedUrl: "https://learningenglish.voanews.com/api/",
  license: "public-domain",
  allowedHost: "learningenglish.voanews.com",
  allowedPathPrefix: "/a/",
  active: false,
  tags: ["news"],
};

test("RSS と Atom の両方から記事を読める", () => {
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Bees Are Busy</title><link>https://learningenglish.voanews.com/a/bees/123.html</link>
    <description>About bees</description><pubDate>Mon, 12 Oct 2026 01:00:00 GMT</pubDate></item>
    <item><title></title><link>https://x.test/empty</link></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(rss), [
    {
      title: "Bees Are Busy",
      url: "https://learningenglish.voanews.com/a/bees/123.html",
      description: "About bees",
      publishedAt: "2026-10-12T01:00:00.000Z",
    },
  ]);

  const atom = `<feed><entry><title>A</title><link href="https://e.test/a"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(atom)[0].url, "https://e.test/a");
});

test("同じ記事URLからは常に同じ教材IDになる", () => {
  const url = "https://learningenglish.voanews.com/a/bees-are-busy/7801234.html";
  assert.equal(materialIdFor("voa-le", url), "voa-le-a-bees-are-busy-7801234");
  assert.equal(materialIdFor("voa-le", url), materialIdFor("voa-le", url));
});

test("署名・SNS誘導・重複・短すぎる行を落とす", () => {
  assert.deepEqual(
    cleanArticleParagraphs([
      "Bees help plants grow by moving pollen.",
      "Share this story",
      "Bees help plants grow by moving pollen.",
      "I'm Jane Doe.",
      "Words in This Story",
      "OK then",
      "Jane Roe / John Doe Headquarters, Washington 202-358-1600 jane.roe@nasa.gov",
      "For more information about the mission, visit:",
    ]),
    ["Bees help plants grow by moving pollen."],
  );
});

test("パブリックドメインの記事は、レビュー待ちの候補になる", () => {
  const c = toCandidate(
    SOURCE,
    { title: "Bees", url: "https://learningenglish.voanews.com/a/bees/1.html", description: "", publishedAt: null },
    ["Bees help plants grow. They move pollen from flower to flower."],
  );
  assert.equal(c?.status, "pending_review");
  assert.deepEqual(c?.sentences, [
    { text: "Bees help plants grow." },
    { text: "They move pollen from flower to flower." },
  ]);
});

test("配信元ドメイン以外へのリンクは取り込まない", () => {
  const c = toCandidate(
    SOURCE,
    { title: "Ext", url: "https://www.reuters.com/x", description: "", publishedAt: null },
    ["Some text here for the story."],
  );
  assert.equal(c, null);
});

test("同じドメインでも、許可したパス以外は取り込まない", () => {
  const c = toCandidate(
    SOURCE,
    { title: "Video", url: "https://learningenglish.voanews.com/z/123", description: "", publishedAt: null },
    ["Some text here for the story."],
  );
  assert.equal(c, null);
});

test("本文が取れなかった記事は rejected になり、理由が残る", () => {
  const c = toCandidate(
    SOURCE,
    { title: "Empty", url: "https://learningenglish.voanews.com/a/e/1.html", description: "", publishedAt: null },
    ["Share"],
  );
  assert.equal(c?.status, "rejected");
  assert.match(c?.reviewNotes.join() ?? "", /本文が空/);
});
