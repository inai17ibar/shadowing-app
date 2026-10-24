/**
 * パスキー（WebAuthn）。署名の検証は @simplewebauthn/server に任せる（自前で書かない）。
 *
 * iOS では ASAuthorizationPlatformPublicKeyCredentialProvider を使い、
 * Associated Domains に `webcredentials:<rpId>` を設定する。サーバーは
 * /.well-known/apple-app-site-association でアプリを許可する。
 * ネイティブアプリからの clientDataJSON の origin は `https://<rpId>` になる。
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Store, User } from "../db/store.ts";
import { base64url, fromBase64url } from "./jwt.ts";
import { resolveExistingOwner, type SignInOutcome } from "./identity.ts";

export interface PasskeyConfig {
  /** 例: shadowing.example.com */
  rpId: string;
  rpName: string;
  /** 例: ["https://shadowing.example.com"] */
  origins: string[];
}

const CHALLENGE_TTL_SEC = 5 * 60;

export class PasskeyError extends Error {}

type RegistrationResponse = Parameters<typeof verifyRegistrationResponse>[0]["response"];
type AuthenticationResponse = Parameters<typeof verifyAuthenticationResponse>[0]["response"];

/** 登録の準備（サインイン済みの利用者に、パスキーを追加する） */
export async function startRegistration(store: Store, config: PasskeyConfig, user: User, displayName: string) {
  const existing = await store.listPasskeys(user.id);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    // サインイン時にユーザー名を入れずに選べるよう、端末側に保存される資格情報にする
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const challengeId = await store.createChallenge({
    challenge: options.challenge,
    purpose: "passkey_register",
    userId: user.id,
    ttlSec: CHALLENGE_TTL_SEC,
  });
  return { challengeId, options };
}

export async function finishRegistration(
  store: Store,
  config: PasskeyConfig,
  user: User,
  input: { challengeId: string; response: RegistrationResponse; name?: string },
) {
  const challenge = await store.consumeChallenge(input.challengeId, "passkey_register", user.id);
  if (!challenge) throw new PasskeyError("チャレンジが無効か期限切れです。最初からやり直してください");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
    });
  } catch (err) {
    throw new PasskeyError(err instanceof Error ? err.message : "パスキーを検証できませんでした");
  }
  if (!verification.verified) throw new PasskeyError("パスキーを検証できませんでした");

  const { credential } = verification.registrationInfo;
  await store.addPasskey(user.id, {
    id: credential.id,
    publicKey: base64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    name: (input.name ?? "").slice(0, 100),
  });
  await store.markRegistered(user.id);
  return { id: credential.id };
}

/** サインインの準備（ユーザー名は聞かず、端末に保存されたパスキーから選ばせる） */
export async function startLogin(store: Store, config: PasskeyConfig) {
  const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: "preferred" });
  const challengeId = await store.createChallenge({
    challenge: options.challenge,
    purpose: "passkey_login",
    userId: null,
    ttlSec: CHALLENGE_TTL_SEC,
  });
  return { challengeId, options };
}

export async function finishLogin(
  store: Store,
  config: PasskeyConfig,
  input: { challengeId: string; response: AuthenticationResponse; current: User | null },
): Promise<SignInOutcome> {
  const challenge = await store.consumeChallenge(input.challengeId, "passkey_login", null);
  if (!challenge) throw new PasskeyError("チャレンジが無効か期限切れです。最初からやり直してください");

  const passkey = await store.getPasskey(input.response.id);
  if (!passkey) throw new PasskeyError("このパスキーは登録されていません");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
      credential: {
        id: passkey.id,
        publicKey: fromBase64url(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
  } catch (err) {
    throw new PasskeyError(err instanceof Error ? err.message : "パスキーを検証できませんでした");
  }
  if (!verification.verified) throw new PasskeyError("パスキーを検証できませんでした");

  await store.touchPasskey(passkey.id, verification.authenticationInfo.newCounter);
  return resolveExistingOwner(store, passkey.userId, input.current);
}
