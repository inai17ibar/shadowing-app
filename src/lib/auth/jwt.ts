/**
 * JWT の最小実装（Web Crypto だけで、Workers と Node の両方で動く）。
 *
 *   - HS256: 自前のアクセストークンの発行・検証
 *   - RS256: Sign in with Apple の identity token の検証
 *   - ES256: Apple の REST API に渡す client_secret の署名
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface JwtParts {
  header: { alg: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
  signingInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

/** 署名は検証せずに分解する。不正な形なら null */
export function decodeJwt(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(dec.decode(fromBase64url(parts[0]))),
      payload: JSON.parse(dec.decode(fromBase64url(parts[1]))),
      signingInput: enc.encode(`${parts[0]}.${parts[1]}`),
      signature: fromBase64url(parts[2]),
    };
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const input = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(input));
  return `${input}.${base64url(new Uint8Array(sig))}`;
}

/** HS256 を検証し、期限内ならペイロードを返す。それ以外は null */
export async function verifyHs256(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown> | null> {
  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== "HS256") return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), jwt.signature, jwt.signingInput);
  if (!ok) return null;
  if (typeof jwt.payload.exp !== "number" || jwt.payload.exp <= nowSec) return null;
  return jwt.payload;
}

export async function verifyRs256(jwt: JwtParts, jwk: JsonWebKey): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.signature, jwt.signingInput);
}

/** PEM(PKCS#8) の P-256 秘密鍵で ES256 署名した JWT を作る（Apple の .p8 キー） */
export async function signEs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  pkcs8Pem: string,
): Promise<string> {
  const der = fromBase64url(
    pkcs8Pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
  );
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const input = `${base64url(JSON.stringify({ ...header, alg: "ES256" }))}.${base64url(JSON.stringify(payload))}`;
  // Web Crypto の ECDSA 署名は JWS が求める r||s 形式（IEEE P1363）で返る
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${base64url(new Uint8Array(sig))}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
