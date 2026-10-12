/**
 * パスキーの登録→サインインを、ソフトウェアで作った認証器（P-256）で通しで確かめる。
 * 実機の Face ID は使えないので、WebAuthn の仕様どおりに attestationObject と署名を組み立てる。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { encodeCBOR, type CBORType } from "@levischuck/tiny-cbor";
import { createTestD1 } from "./helpers/d1.ts";
import { createStore } from "../src/lib/db/store.ts";
import { base64url, fromBase64url } from "../src/lib/auth/jwt.ts";
import { startRegistration, finishRegistration, startLogin, finishLogin, PasskeyError } from "../src/lib/auth/passkey.ts";

const CONFIG = { rpId: "shadowing.example.com", rpName: "Shadowing", origins: ["https://shadowing.example.com"] };
const enc = new TextEncoder();

async function sha256(data: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>));
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** WebCrypto の ECDSA 署名（r||s）を WebAuthn が使う DER 形式に変える */
function rawToDer(raw: Uint8Array) {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

async function softwareAuthenticator(rpId = CONFIG.rpId, origin = CONFIG.origins[0]) {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  let counter = 0;
  const rpIdHash = await sha256(enc.encode(rpId));
  const clientData = (type: string, challenge: string) =>
    enc.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    id: base64url(credId),
    async register(challenge: string) {
      const cose = new Map<number, CBORType>([
        [1, 2], [3, -7], [-1, 1], [-2, fromBase64url(jwk.x!)], [-3, fromBase64url(jwk.y!)],
      ]);
      const authData = concat(
        rpIdHash,
        new Uint8Array([0x45]), // UP | UV | AT
        new Uint8Array(4), // signCount
        new Uint8Array(16), // aaguid
        new Uint8Array([0, credId.length]),
        credId,
        encodeCBOR(cose),
      );
      const attestationObject = encodeCBOR(
        new Map<string, CBORType>([["fmt", "none"], ["attStmt", new Map<string, CBORType>()], ["authData", authData]]),
      );
      return {
        id: base64url(credId),
        rawId: base64url(credId),
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(clientData("webauthn.create", challenge)),
          attestationObject: base64url(attestationObject),
          transports: ["internal" as const],
        },
      };
    },
    async login(challenge: string, { replayCounter = false } = {}) {
      if (!replayCounter) counter++;
      const authData = concat(
        rpIdHash,
        new Uint8Array([0x05]), // UP | UV
        new Uint8Array([0, 0, 0, counter]),
      );
      const cd = clientData("webauthn.get", challenge);
      const sig = new Uint8Array(
        await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, concat(authData, await sha256(cd)) as Uint8Array<ArrayBuffer>),
      );
      return {
        id: base64url(credId),
        rawId: base64url(credId),
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(cd),
          authenticatorData: base64url(authData),
          signature: base64url(rawToDer(sig)),
        },
      };
    },
  };
}

async function setup() {
  const store = createStore(createTestD1());
  const user = await store.createUser();
  const device = await softwareAuthenticator();
  const reg = await startRegistration(store, CONFIG, user, "me@example.com");
  await finishRegistration(store, CONFIG, user, {
    challengeId: reg.challengeId,
    response: await device.register(reg.options.challenge),
    name: "iPhone",
  });
  return { store, user, device };
}

test("パスキーを登録すると、匿名アカウントが本登録になる", async () => {
  const { store, user, device } = await setup();
  assert.equal((await store.getUser(user.id))?.isAnonymous, false);
  const [pk] = await store.listPasskeys(user.id);
  assert.equal(pk.id, device.id);
  assert.equal(pk.name, "iPhone");
});

test("登録したパスキーでサインインでき、カウンタが進む", async () => {
  const { store, user, device } = await setup();
  const login = await startLogin(store, CONFIG);
  const r = await finishLogin(store, CONFIG, {
    challengeId: login.challengeId,
    response: await device.login(login.options.challenge),
    current: null,
  });
  assert.ok(r.status === "ok" && r.user.id === user.id);
  assert.equal((await store.getPasskey(device.id))?.counter, 1);
});

test("チャレンジの使い回し・別の challenge・未登録の鍵・別ドメインは拒否する", async () => {
  const { store, device } = await setup();

  const login = await startLogin(store, CONFIG);
  const response = await device.login(login.options.challenge);
  await finishLogin(store, CONFIG, { challengeId: login.challengeId, response, current: null });
  await assert.rejects(
    finishLogin(store, CONFIG, { challengeId: login.challengeId, response, current: null }),
    PasskeyError,
    "同じチャレンジは2回使えない",
  );

  const l2 = await startLogin(store, CONFIG);
  await assert.rejects(
    finishLogin(store, CONFIG, { challengeId: l2.challengeId, response: await device.login("other-challenge"), current: null }),
    PasskeyError,
    "別の challenge に対する署名",
  );

  const stranger = await softwareAuthenticator();
  const l3 = await startLogin(store, CONFIG);
  await assert.rejects(
    finishLogin(store, CONFIG, { challengeId: l3.challengeId, response: await stranger.login(l3.options.challenge), current: null }),
    PasskeyError,
    "未登録の鍵",
  );

  const phishing = await softwareAuthenticator(CONFIG.rpId, "https://evil.example");
  const user2 = await store.createUser();
  const reg = await startRegistration(store, CONFIG, user2, "x");
  await assert.rejects(
    finishRegistration(store, CONFIG, user2, { challengeId: reg.challengeId, response: await phishing.register(reg.options.challenge) }),
    PasskeyError,
    "別ドメインの origin",
  );
});

test("匿名のままパスキーでサインインすると、匿名の記録が持ち主に統合される", async () => {
  const { store, user, device } = await setup();
  const anon = await store.createUser();
  await store.insertAttempt(anon.id, {
    id: crypto.randomUUID(), materialId: "m1", step: "listen", sentenceIndex: null, score: null,
    lagMs: null, rhythm: null, rateRatio: null, coverage: null, durationMs: null, createdAt: new Date().toISOString(),
  });
  const login = await startLogin(store, CONFIG);
  const r = await finishLogin(store, CONFIG, {
    challengeId: login.challengeId,
    response: await device.login(login.options.challenge),
    current: anon,
  });
  assert.ok(r.status === "ok" && r.mergedAnonymous && r.user.id === user.id);
  assert.equal((await store.listAttempts(user.id)).length, 1);
});
