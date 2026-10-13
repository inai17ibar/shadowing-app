import test from "node:test";
import assert from "node:assert/strict";
import { createTestD1 } from "./helpers/d1.ts";
import { createStore, type AttemptInput } from "../src/lib/db/store.ts";
import { signInWithIdentity } from "../src/lib/auth/identity.ts";
import { issueCode, verifyCode, normalizeEmail, generateCode, MAX_ATTEMPTS } from "../src/lib/auth/email-code.ts";

const SECRET = "test-secret-at-least-32-bytes-long!!";

function attempt(): AttemptInput {
  return {
    id: crypto.randomUUID(), materialId: "m1", step: "listen", sentenceIndex: null, score: null,
    lagMs: null, rhythm: null, rateRatio: null, coverage: null, durationMs: null,
    createdAt: "2026-10-12T00:00:00.000Z",
  };
}

const google = (subject: string) => ({ provider: "google" as const, subject, email: `${subject}@gmail.com` });

test("初めての方法でサインインすると、本登録のアカウントが作られる", async () => {
  const store = createStore(createTestD1());
  const r = await signInWithIdentity(store, { ...google("g1"), current: null });
  assert.equal(r.status, "ok");
  assert.ok(r.status === "ok" && r.created && !r.user.isAnonymous);
});

test("匿名で練習してから新しい方法を追加すると、同じアカウントのまま本登録になる", async () => {
  const store = createStore(createTestD1());
  const anon = await store.createUser();
  await store.insertAttempt(anon.id, attempt());
  const r = await signInWithIdentity(store, { ...google("g1"), current: anon });
  assert.ok(r.status === "ok" && r.linked && r.user.id === anon.id && !r.user.isAnonymous);
  assert.equal((await store.listAttempts(anon.id)).length, 1);
});

test("匿名で練習してから既存アカウントにサインインすると、匿名の記録が統合される", async () => {
  const store = createStore(createTestD1());
  const first = await signInWithIdentity(store, { ...google("g1"), current: null });
  assert.equal(first.status, "ok");
  const owner = first.status === "ok" ? first.user : null!;
  await store.insertAttempt(owner.id, attempt());

  // 別の端末で、匿名のまま練習した
  const anon = await store.createUser();
  await store.insertAttempt(anon.id, attempt());
  await store.insertAttempt(anon.id, attempt());

  const r = await signInWithIdentity(store, { ...google("g1"), current: anon });
  assert.ok(r.status === "ok" && r.mergedAnonymous && r.user.id === owner.id);
  assert.equal((await store.listAttempts(owner.id)).length, 3, "記録を失わない");
  assert.equal(await store.getUser(anon.id), null);
});

test("本登録アカウントで、別人の使っている方法を追加しようとすると conflict（勝手に切り替えない）", async () => {
  const store = createStore(createTestD1());
  await signInWithIdentity(store, { ...google("g1"), current: null });
  const other = await signInWithIdentity(store, { provider: "email", subject: "b@example.com", current: null });
  const me = other.status === "ok" ? other.user : null!;
  assert.deepEqual(await signInWithIdentity(store, { ...google("g1"), current: me }), { status: "conflict" });
});

test("メールアドレスが同じでも、別の方法同士は自動で結び付けない", async () => {
  const store = createStore(createTestD1());
  const a = await signInWithIdentity(store, { provider: "google", subject: "g1", email: "x@example.com", current: null });
  const b = await signInWithIdentity(store, { provider: "email", subject: "x@example.com", email: "x@example.com", current: null });
  assert.ok(a.status === "ok" && b.status === "ok" && a.user.id !== b.user.id);
});

test("最後のログイン方法の数え方: 外部IDとパスキーの合計", async () => {
  const store = createStore(createTestD1());
  const r = await signInWithIdentity(store, { ...google("g1"), current: null });
  const user = r.status === "ok" ? r.user : null!;
  assert.equal(await store.countLoginMethods(user.id), 1);
  await store.addPasskey(user.id, { id: "cred1", publicKey: "pk", counter: 0, transports: [], name: "" });
  assert.equal(await store.countLoginMethods(user.id), 2);
});

// ---------------------------------------------------------------------------
// メールのワンタイムコード
// ---------------------------------------------------------------------------

test("メール: アドレスを正規化し、不正な形式は弾く", () => {
  assert.equal(normalizeEmail("  Foo@Example.COM "), "foo@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail(42), null);
  assert.match(generateCode(), /^\d{6}$/);
});

test("メール: 正しいコードは一度だけ通り、DBにはコードそのものを残さない", async () => {
  const store = createStore(createTestD1());
  const issued = await issueCode(store, "a@example.com", SECRET, { code: "123456" });
  assert.deepEqual(issued, { status: "issued", code: "123456" });
  assert.notEqual((await store.getEmailCode("a@example.com"))?.codeHash, "123456");
  assert.equal(await verifyCode(store, "a@example.com", "123456", SECRET), "ok");
  assert.equal(await verifyCode(store, "a@example.com", "123456", SECRET), "invalid", "使い回せない");
});

test("メール: 5回間違えると、正しいコードでも通らない", async () => {
  const store = createStore(createTestD1());
  await issueCode(store, "a@example.com", SECRET, { code: "123456" });
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    assert.equal(await verifyCode(store, "a@example.com", "000000", SECRET), "invalid");
  }
  assert.equal(await verifyCode(store, "a@example.com", "000000", SECRET), "too_many_attempts");
  assert.equal(await verifyCode(store, "a@example.com", "123456", SECRET), "too_many_attempts");
});

test("メール: 10分を過ぎたコードは期限切れ、60秒以内の再送は断る", async () => {
  let t = Date.parse("2026-10-12T00:00:00Z");
  const store = createStore(createTestD1(), { now: () => new Date(t) });
  await issueCode(store, "a@example.com", SECRET, { code: "123456", now: new Date(t) });
  const soon = await issueCode(store, "a@example.com", SECRET, { now: new Date(t + 30_000) });
  assert.deepEqual(soon, { status: "too_soon", retryAfterSec: 30 });

  t += 11 * 60_000;
  assert.equal(await verifyCode(store, "a@example.com", "123456", SECRET, new Date(t)), "expired");
});

test("メール: 鍵（AUTH_SECRET）が違えば同じコードでも通らない", async () => {
  const store = createStore(createTestD1());
  await issueCode(store, "a@example.com", SECRET, { code: "123456" });
  assert.equal(await verifyCode(store, "a@example.com", "123456", "another-secret-at-least-32-bytes!!"), "invalid");
});
