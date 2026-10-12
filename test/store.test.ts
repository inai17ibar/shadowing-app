import test from "node:test";
import assert from "node:assert/strict";
import { createTestD1 } from "./helpers/d1.ts";
import { createStore, type AttemptInput, type MaterialCandidate } from "../src/lib/db/store.ts";

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

function attempt(partial: Partial<AttemptInput> = {}): AttemptInput {
  return {
    id: crypto.randomUUID(), materialId: "m1", step: "listen", sentenceIndex: null, score: null,
    lagMs: null, rhythm: null, rateRatio: null, coverage: null, durationMs: null,
    createdAt: "2026-10-12T00:00:00.000Z", ...partial,
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
  await store.insertAttempt(alice.id, attempt());
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

test("同じ id の練習記録は二重に保存されず、他人の id とは衝突として扱う", async () => {
  const { store, alice, bob } = await setup();
  await store.insertMaterialCandidates([material("m1")]);
  const a = attempt({ step: "record", score: 80 });
  assert.equal((await store.insertAttempt(alice.id, a)).status, "created");
  const again = await store.insertAttempt(alice.id, { ...a, score: 10 });
  assert.equal(again.status, "duplicate");
  assert.equal(again.status === "duplicate" && again.attempt.score, 80, "再送で内容は上書きされない");
  assert.equal((await store.insertAttempt(bob.id, a)).status, "conflict");
  assert.equal((await store.listAttempts(alice.id)).length, 1);
  assert.equal((await store.listAttempts(bob.id)).length, 0);
});

test("同期: 受け取った順に、カーソル以降だけを返す", async () => {
  const { store, alice, bob } = await setup();
  await store.insertMaterialCandidates([material("m1")]);
  // 練習時刻（createdAt）は古い順と限らない。オフライン分は後から届く
  for (const createdAt of ["2026-10-10T00:00:00.000Z", "2026-10-01T00:00:00.000Z", "2026-10-11T00:00:00.000Z"]) {
    await store.insertAttempt(alice.id, attempt({ createdAt }));
  }
  await store.insertAttempt(bob.id, attempt());

  const p1 = await store.listAttemptsReceivedAfter(alice.id, null, 2);
  assert.deepEqual(p1.items.map((a) => a.createdAt.slice(0, 10)), ["2026-10-10", "2026-10-01"]);
  assert.equal(p1.hasMore, true);
  const p2 = await store.listAttemptsReceivedAfter(alice.id, p1.nextCursor, 2);
  assert.deepEqual(p2.items.map((a) => a.createdAt.slice(0, 10)), ["2026-10-11"]);
  assert.equal(p2.hasMore, false);

  await store.insertAttempt(alice.id, attempt());
  const p3 = await store.listAttemptsReceivedAfter(alice.id, p2.nextCursor, 10);
  assert.equal(p3.items.length, 1, "前回以降に届いた分だけ");
});

test("匿名の記録を既存アカウントに統合すると、記録が移り匿名アカウントは消える", async () => {
  const { store, alice } = await setup();
  await store.insertMaterialCandidates([material("m1")]);
  const registered = await store.createUser({ anonymous: false });
  await store.upsertProfile(registered.id, { level: "advanced" });
  await store.upsertProfile(alice.id, { level: "beginner" });
  await store.setAssignment(alice.id, { materialId: "m1", startedOn: "2026-10-12" });
  await store.insertAttempt(alice.id, attempt());
  await store.insertText(alice.id, { title: "a", sourceUrl: "", sentences: ["x"] });
  await store.createSession(alice.id, "anon-session", "2027-01-01T00:00:00Z");

  await store.mergeAnonymousUser(alice.id, registered.id);

  assert.equal(await store.getUser(alice.id), null);
  assert.equal((await store.listAttempts(registered.id)).length, 1);
  assert.equal((await store.listTexts(registered.id)).length, 1);
  assert.equal((await store.getProfile(registered.id))?.level, "advanced", "本登録側の設定を優先");
  assert.equal((await store.getAssignment(registered.id))?.materialId, "m1", "移し先に無ければ引き継ぐ");
  assert.equal(await store.consumeSession("anon-session"), null);
});

test("本登録アカウントは統合の移し元にできない", async () => {
  const { store } = await setup();
  const a = await store.createUser({ anonymous: false });
  const b = await store.createUser({ anonymous: false });
  await assert.rejects(store.mergeAnonymousUser(a.id, b.id));
});

test("チャレンジは一度だけ・目的と持ち主が一致するときだけ使える", async () => {
  const { store, alice, bob } = await setup();
  const id = await store.createChallenge({ challenge: "c1", purpose: "passkey_register", userId: alice.id, ttlSec: 60 });
  assert.equal(await store.consumeChallenge(id, "passkey_register", bob.id), null, "別人");
  const id2 = await store.createChallenge({ challenge: "c2", purpose: "passkey_register", userId: alice.id, ttlSec: 60 });
  assert.equal(await store.consumeChallenge(id2, "passkey_login", alice.id), null, "目的違い");
  const id3 = await store.createChallenge({ challenge: "c3", purpose: "passkey_register", userId: alice.id, ttlSec: 60 });
  assert.equal(await store.consumeChallenge(id3, "passkey_register", alice.id), "c3");
  assert.equal(await store.consumeChallenge(id3, "passkey_register", alice.id), null, "2回目");
});

test("Web版の保存テキストを保存・取得・削除できる", async () => {
  const { store } = await setup();
  const id = await store.insertSavedText({ title: "t", source_url: "", paragraphs: ["p1", "p2"] });
  assert.deepEqual((await store.getSavedText(id))?.paragraphs, ["p1", "p2"]);
  assert.equal((await store.listSavedTexts()).length, 1);
  assert.equal(await store.deleteSavedText(id), true);
  assert.equal(await store.getSavedText(id), null);
});
