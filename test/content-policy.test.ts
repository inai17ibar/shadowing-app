import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCandidate,
  detectThirdPartyCredits,
  splitSentences,
  estimateLevel,
  type ContentCandidate,
} from "../src/lib/content-policy.ts";

function candidate(partial: Partial<ContentCandidate>): ContentCandidate {
  return {
    title: "Title",
    sentences: ["Hello world."],
    sourceName: "Source",
    sourceUrl: "https://example.com/a",
    license: "public-domain",
    ...partial,
  };
}

test("自社オリジナルはレビューなしで公開できる", () => {
  assert.deepEqual(evaluateCandidate(candidate({ license: "original", sourceUrl: "" })), {
    ok: true, needsReview: false, notes: [],
  });
});

test("パブリックドメインは公開できるが、人のレビューを通す", () => {
  const v = evaluateCandidate(candidate({ license: "public-domain" }));
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.needsReview, true);
});

test("NC・ND・不明なライセンスは有料アプリで配信できない", () => {
  for (const license of ["cc-by-nc", "cc-by-nd", "cc-by-nc-nd", "unknown"] as const) {
    assert.equal(evaluateCandidate(candidate({ license })).ok, false, license);
  }
});

test("CC BY は帰属表示が無いと配信できない", () => {
  assert.equal(evaluateCandidate(candidate({ license: "cc-by" })).ok, false);
  assert.equal(evaluateCandidate(candidate({ license: "cc-by", attribution: "by Jane" })).ok, true);
});

test("CC BY-SA は配信できるが、派生物も同じライセンスになる旨が付く", () => {
  const v = evaluateCandidate(candidate({ license: "cc-by-sa", attribution: "Wikipedia contributors" }));
  assert.equal(v.ok, true);
  assert.match(v.ok ? v.notes.join() : "", /CC BY-SA/);
});

test("契約コンテンツは契約IDが必要", () => {
  assert.equal(evaluateCandidate(candidate({ license: "licensed" })).ok, false);
  assert.equal(evaluateCandidate(candidate({ license: "licensed", licenseRef: "C-001" })).ok, true);
});

test("VOA記事でも通信社クレジットがあれば注意として残す", () => {
  const v = evaluateCandidate(candidate({ sentences: ["WASHINGTON (AP) — Officials said..."] }));
  assert.equal(v.ok, true);
  assert.match(v.ok ? v.notes.join() : "", /AP/);
  assert.deepEqual(detectThirdPartyCredits("Photo: Reuters. © 2026"), ["Reuters", "著作権表示"]);
});

test("文分割: 略語では切らず、文末で切る", () => {
  assert.deepEqual(
    splitSentences(["Mr. Smith went to the U.S. last year. He liked it! Did you?"]),
    ["Mr. Smith went to the U.S. last year.", "He liked it!", "Did you?"],
  );
});

test("文分割: 時刻や月の略語で切らない", () => {
  assert.deepEqual(
    splitSentences(["Fans can visit from 10 a.m. to 1 p.m. EDT before the game. It starts Oct. 11 at noon."]),
    ["Fans can visit from 10 a.m. to 1 p.m. EDT before the game.", "It starts Oct. 11 at noon."],
  );
});

test("文分割: カンマで割ったときの短い切れ端は前の塊に戻す", () => {
  const s =
    "NASA Administrator Jared Isaacman will pilot one of three jets to kick off the game between the two teams in East Rutherford, New Jersey, on Sunday, Oct. 11.";
  const parts = splitSentences([s], { maxWords: 20 });
  assert.ok(parts.every((p) => p.split(" ").length >= 6), JSON.stringify(parts));
  assert.equal(parts.join(" "), s);
});

test("文分割: 長すぎる文はカンマで割る", () => {
  const long =
    "When the scientists finally arrived at the station after a long and difficult journey, " +
    "they discovered that the equipment had been damaged by the storm, " +
    "and they had to wait for several weeks before the replacement parts could be delivered.";
  const parts = splitSentences([long], { maxWords: 20 });
  assert.ok(parts.length >= 2, `分割されていない: ${parts.length}`);
  assert.equal(parts.join(" "), long);
});

test("レベル推定: 短く平易な文は初級、長く難しい文は上級", () => {
  assert.equal(estimateLevel(["I like cats.", "She is my friend.", "We go to school."]), "beginner");
  assert.equal(
    estimateLevel([
      "Notwithstanding considerable methodological disagreements, contemporary epidemiological investigations increasingly demonstrate substantial correlations between environmental deterioration and cardiovascular morbidity.",
    ]),
    "advanced",
  );
});
