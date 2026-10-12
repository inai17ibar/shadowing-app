import test from "node:test";
import assert from "node:assert/strict";
import { createTestD1 } from "./helpers/d1.ts";
import { createStore } from "../src/lib/db/store.ts";
import { base64url, decodeJwt, sha256Hex, signHs256, verifyHs256 } from "../src/lib/auth/jwt.ts";
import { verifyAppleIdentityToken, makeClientSecret, AppleTokenError } from "../src/lib/auth/apple.ts";
import { issueTokens, rotateRefreshToken, verifyAccessToken } from "../src/lib/auth/sessions.ts";

const SECRET = "test-secret-at-least-32-bytes-long!!";
const NOW = 1_800_000_000;

test("HS256: 署名・期限・改ざんを検証する", async () => {
  const token = await signHs256({ sub: "u1", exp: NOW + 60 }, SECRET);
  assert.equal((await verifyHs256(token, SECRET, NOW))?.sub, "u1");
  assert.equal(await verifyHs256(token, SECRET, NOW + 61), null, "期限切れ");
  assert.equal(await verifyHs256(token, "other-secret", NOW), null, "別の鍵");
  const [h, , s] = token.split(".");
  const forged = `${h}.${base64url(JSON.stringify({ sub: "admin", exp: NOW + 60 }))}.${s}`;
  assert.equal(await verifyHs256(forged, SECRET, NOW), null, "ペイロード改ざん");
  const none = `${base64url(JSON.stringify({ alg: "none" }))}.${base64url(JSON.stringify({ sub: "x", exp: NOW + 60 }))}.`;
  assert.equal(await verifyHs256(none, SECRET, NOW), null, "alg=none");
});

// --- Apple の identity token を、テスト用のRSA鍵で模造する -------------------
async function appleFixture() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const sign = async (payload: Record<string, unknown>, kid = "k1") => {
    const input = `${base64url(JSON.stringify({ alg: "RS256", kid }))}.${base64url(JSON.stringify(payload))}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${base64url(new Uint8Array(sig))}`;
  };
  const fetchJwks = async () => ({ keys: [jwk] });
  const base = { iss: "https://appleid.apple.com", aud: "com.example.shadowing", sub: "001.abc", exp: NOW + 600 };
  return { sign, fetchJwks, base };
}

test("Apple: 正しい identity token から sub を取り出せる（nonce 付き）", async () => {
  const { sign, fetchJwks, base } = await appleFixture();
  const token = await sign({ ...base, nonce: await sha256Hex("raw-nonce"), email: "a@privaterelay.appleid.com" });
  const r = await verifyAppleIdentityToken(token, {
    clientId: "com.example.shadowing", nonce: "raw-nonce", fetchJwks, nowSec: NOW,
  });
  assert.deepEqual(r, { sub: "001.abc", email: "a@privaterelay.appleid.com" });
});

test("Apple: 別アプリ向け・期限切れ・発行者違い・nonce違い・未知の鍵は拒否する", async () => {
  const { sign, fetchJwks, base } = await appleFixture();
  const opts = { clientId: "com.example.shadowing", fetchJwks, nowSec: NOW };
  const cases: Array<[string, Promise<string>, object?]> = [
    ["aud", sign({ ...base, aud: "com.other.app" })],
    ["exp", sign({ ...base, exp: NOW - 1 })],
    ["iss", sign({ ...base, iss: "https://evil.example" })],
    ["nonce", sign({ ...base, nonce: await sha256Hex("a") }), { nonce: "b" }],
    ["kid", sign(base, "unknown")],
  ];
  for (const [name, token, extra] of cases) {
    await assert.rejects(verifyAppleIdentityToken(await token, { ...opts, ...extra }), AppleTokenError, name);
  }
});

test("Apple: client_secret は ES256 で署名され、公開鍵で検証できる", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
  const secret = await makeClientSecret(
    { clientId: "com.example.shadowing", teamId: "TEAM123", keyId: "KEY123", privateKey: pem },
    NOW,
  );
  const jwt = decodeJwt(secret)!;
  assert.deepEqual(jwt.header, { kid: "KEY123", alg: "ES256" });
  assert.equal(jwt.payload.iss, "TEAM123");
  assert.equal(jwt.payload.sub, "com.example.shadowing");
  assert.ok(
    await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, jwt.signature, jwt.signingInput),
  );
});

test("セッション: 発行したアクセストークンが検証でき、リフレッシュで新しいペアに替わる", async () => {
  const store = createStore(createTestD1());
  const user = await store.createUser();
  const pair = await issueTokens(store, SECRET, user);
  assert.equal((await verifyAccessToken(pair.accessToken, SECRET))?.userId, user.id);

  const next = await rotateRefreshToken(store, SECRET, pair.refreshToken);
  assert.ok(next);
  assert.notEqual(next.refreshToken, pair.refreshToken);
  assert.equal(await rotateRefreshToken(store, SECRET, pair.refreshToken), null, "古いトークンは使えない");
});

test("セッション: 退会した利用者のリフレッシュトークンは使えない", async () => {
  const store = createStore(createTestD1());
  const user = await store.createUser();
  const pair = await issueTokens(store, SECRET, user);
  await store.deleteUser(user.id);
  assert.equal(await rotateRefreshToken(store, SECRET, pair.refreshToken), null);
});
