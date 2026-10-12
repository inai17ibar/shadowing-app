import test from "node:test";
import assert from "node:assert/strict";
import { createTestD1 } from "./helpers/d1.ts";
import { createStore, type MaterialCandidate } from "../src/lib/db/store.ts";

function material(id: string, partial: Partial<MaterialCandidate> = {}): MaterialCandidate {
  return {
    id,
    title: `T ${id}`,
    level: "beginner",
    description: "",
    tags: ["news"],
    sourceName: "S",
    sourceUrl: "https://example.com",
    license: "original",
    attribution: null,
    sentences: [{ text: "Hello." }, { text: "World." }],
    status: "published",
    reviewNotes: [],
    ...partial,
  };
}

async function setup() {
  let t = Date.parse("2026-10-12T00:00:00Z");
  // 呼ぶたびに1秒進む時計（公開日時の並び順を決めるため）
  const store = createStore(createTestD1(), { now: () => new Date((t += 1000)) });
  const alice = await store.createUser();
  const bob = await store.createUser();
  return { store, alice, bob };
}

test("他人の文章・練習記録・プロフィールは見えず、消せない（RLSの代わり）", async () => {
  const { store, alice, bob } = await setup();
  await store.insertMaterialCandidates([material("m1")]);
  const text = await store.insertText(alice.id, { title: "a", sourceUrl: "", sentences: ["x"] });
  await store.insertAttempt(alice.id, {
    materialId: "m1", step: "listen", sentenceIndex: null, score: null,
    lagMs: null, rhythm: null, rateRatio: null, coverage: null, durationMs: null,
  });
  await store.upsertProfile(alice.id, { level: "advanced" });

  assert.equal(await store.getText(bob.id, text.id), null);
  assert.deepEqual(await store.listTexts(bob.id), []);
  assert.equal(await store.deleteText(bob.id, text.id), false);
  assert.deepEqual(await store.listAttempts(bob.id), []);
  assert.equal(await store.getProfile(bob.id), null);

  assert.equal((await store.getText(alice.id, text.id))?.title, "a");
  assert.equal((await store.listAttempts(alice.id)).length, 1);
});

test("アカウント削除で本人の行がすべて消え、通報は匿名化して残る", async () => {
  const { store, alice, bob } = await setup();
  await store.insertMaterialCandidates([material("m1")]);
  await store.insertText(alice.id, { title: "a", sourceUrl: "", sentences: ["x"] });
  await store.upsertProfile(alice.id, {});
  await store.setAssignment(alice.id, { materialId: "m1", startedOn: "2026-10-12" });
  await store.createSession(alice.id, "h1", "2027-01-01T00:00:00Z");
  await store.insertReport(alice.id, { targetType: "app", targetId: null, reason: "other", detail: "" });
  await store.insertText(bob.id, { title: "b", sourceUrl: "", sentences: ["y"] });

  await store.deleteUser(alice.id);

  assert.equal(await store.getUser(alice.id), null);
  assert.equal(await store.getProfile(alice.id), null);
  assert.equal(await store.getAssignment(alice.id), null);
  assert.deepEqual(await store.listTexts(alice.id), []);
  assert.equal(await store.consumeSession("h1"), null);
  assert.equal((await store.listTexts(bob.id)).length, 1, "他人のデータは消えない");
});

test("公開済みの教材だけが見え、新しい順にページングできる", async () => {
  const { store } = await setup();
  await store.insertMaterialCandidates([
    material("a"), material("b", { level: "advanced" }), material("c"),
    material("hidden", { status: "pending_review", license: "public-domain" }),
  ]);
  // INSERT は1件ずつ時計が進むわけではないので、公開日時は同じでも id の降順で安定する
  const p1 = await store.listMaterials({ limit: 2 });
  assert.equal(p1.items.length, 2);
  assert.ok(p1.nextCursor);
  const p2 = await store.listMaterials({ limit: 2, cursor: p1.nextCursor! });
  const ids = [...p1.items, ...p2.items].map((m) => m.id);
  assert.deepEqual(ids.sort(), ["a", "b", "c"]);
  assert.equal(p2.nextCursor, null);

  assert.deepEqual((await store.listMaterials({ limit: 10, level: "advanced" })).items.map((m) => m.id), ["b"]);
  assert.equal((await store.listMaterials({ limit: 10, tag: "none" })).items.length, 0);
  assert.equal(await store.getMaterial("hidden"), null);
  assert.equal(p1.items[0].sentenceCount, 2);
});

test("候補の取り込みは同じ id を二重に入れない", async () => {
  const { store } = await setup();
  assert.equal(await store.insertMaterialCandidates([material("a"), material("b")]), 2);
  assert.equal(await store.insertMaterialCandidates([material("a"), material("c")]), 1);
});

test("配信できないライセンスは DB が公開を拒否する", async () => {
  const { store } = await setup();
  await assert.rejects(store.insertMaterialCandidates([material("nc", { license: "cc-by-nc" })]));
  await assert.rejects(store.insertMaterialCandidates([material("by", { license: "cc-by" })]), "帰属表示なしのCC BY");
  assert.equal(await store.insertMaterialCandidates([material("u", { license: "unknown", status: "pending_review" })]), 1);
});

test("リフレッシュトークンは一度しか使えず、期限切れは無効", async () => {
  const { store, alice } = await setup();
  await store.createSession(alice.id, "h1", "2027-01-01T00:00:00Z");
  assert.equal(await store.consumeSession("h1"), alice.id);
  assert.equal(await store.consumeSession("h1"), null);
  await store.createSession(alice.id, "old", "2026-01-01T00:00:00Z");
  assert.equal(await store.consumeSession("old"), null);
});

test("匿名ユーザーに Apple ID を結び付けると本登録になる", async () => {
  const { store, alice } = await setup();
  assert.equal(alice.isAnonymous, true);
  await store.linkApple(alice.id, "apple-sub-1", "rt");
  const linked = await store.findUserByAppleSub("apple-sub-1");
  assert.equal(linked?.id, alice.id);
  assert.equal(linked?.isAnonymous, false);
  assert.equal(linked?.appleRefreshToken, "rt");
});

test("Web版の保存テキストを保存・取得・削除できる", async () => {
  const { store } = await setup();
  const id = await store.insertSavedText({ title: "t", source_url: "", paragraphs: ["p1", "p2"] });
  assert.deepEqual((await store.getSavedText(id))?.paragraphs, ["p1", "p2"]);
  assert.equal((await store.listSavedTexts()).length, 1);
  assert.equal(await store.deleteSavedText(id), true);
  assert.equal(await store.getSavedText(id), null);
});
