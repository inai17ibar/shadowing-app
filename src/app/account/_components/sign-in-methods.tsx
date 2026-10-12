"use client";

import { useEffect, useRef, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api, ApiClientError, errorMessage } from "@/lib/client/api";
import { Button, inputClass, Notice, type NoticeState } from "./ui";

export interface AuthMethods {
  email: boolean;
  google: { webClientId: string } | null;
  passkey: boolean;
  apple: boolean;
}

/** サインイン系エンドポイントの結果（Web はトークンを Cookie で受け取るので本文には無い） */
interface SignInResult {
  created?: boolean;
  linked?: boolean;
  mergedAnonymous?: boolean;
}

/** サインインの結果を利用者向けの文に直す */
function describe(r: SignInResult, method: string): string {
  if (r.mergedAnonymous) return `${method}でサインインし、匿名で練習した記録を引き継ぎました`;
  if (r.linked) return `${method}をこのアカウントのログイン方法に追加しました`;
  if (r.created) return `${method}で新しいアカウントを作りました`;
  return `${method}でサインインしました`;
}

function failure(err: unknown): NoticeState {
  // 409: その方法は別の本登録アカウントのもの。勝手に切り替えないのでサインアウトを促す
  if (err instanceof ApiClientError && err.status === 409) {
    return { kind: "error", text: `${err.message}（下の「サインアウト」をしてから、もう一度お試しください）` };
  }
  return { kind: "error", text: errorMessage(err) };
}

// ---------------------------------------------------------------------------
// Google Identity Services の最小の型
// ---------------------------------------------------------------------------
interface GoogleId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Google のスクリプトを読み込めませんでした")));
  });
}

export function SignInMethods({
  methods,
  hasPasskeys,
  onSignedIn,
}: {
  methods: AuthMethods;
  hasPasskeys: boolean;
  /** サインイン・方法の追加のあとに呼ぶ（状態を読み直す） */
  onSignedIn: () => Promise<void>;
}) {
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      const text = await fn();
      await onSignedIn();
      setNotice({ kind: "success", text });
    } catch (err) {
      setNotice(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {methods.email && <EmailCode busy={busy} run={run} />}
      {methods.google && <GoogleButton clientId={methods.google.webClientId} run={run} />}
      {methods.passkey && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800">パスキー</h3>
          <p className="mt-1 text-xs text-gray-500">端末の指紋・顔認証・PIN でサインインします。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>(
                    "POST",
                    "/auth/passkey/register/options",
                  );
                  const response = await startRegistration({ optionsJSON: options });
                  await api("POST", "/auth/passkey/register/verify", {
                    challengeId,
                    response,
                    name: `Web（${new Date().toLocaleDateString("ja-JP")} 登録）`,
                  });
                  return "パスキーを登録しました";
                })
              }
            >
              {hasPasskeys ? "パスキーをもう1つ登録" : "パスキーを登録"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
                    "POST",
                    "/auth/passkey/login/options",
                  );
                  const response = await startAuthentication({ optionsJSON: options });
                  const r = await api<SignInResult>("POST", "/auth/passkey/login/verify", { challengeId, response });
                  return describe(r, "パスキー");
                })
              }
            >
              パスキーでサインイン
            </Button>
          </div>
        </div>
      )}
      {!methods.email && !methods.google && !methods.passkey && (
        <p className="text-sm text-gray-500">このサーバーでは、まだログイン方法が設定されていません。</p>
      )}
      <Notice notice={notice} />
    </div>
  );
}

function EmailCode({ busy, run }: { busy: boolean; run: (fn: () => Promise<string>) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800">メールのワンタイムコード</h3>
      {!sentTo ? (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("POST", "/auth/email/start", { email });
              setSentTo(email);
              return `${email} に6桁のコードを送りました（10分間有効）`;
            });
          }}
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
            aria-label="メールアドレス"
          />
          <Button type="submit" disabled={busy || !email}>
            コードを送る
          </Button>
        </form>
      ) : (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api<SignInResult>("POST", "/auth/email/verify", { email: sentTo, code: code.trim() });
              setSentTo(null);
              setCode("");
              return describe(r, "メール");
            });
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} w-32 tracking-widest`}
            aria-label="6桁のコード"
          />
          <Button type="submit" disabled={busy || code.length !== 6}>
            確認
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setSentTo(null)}>
            アドレスを変える
          </Button>
        </form>
      )}
    </div>
  );
}

function GoogleButton({ clientId, run }: { clientId: string; run: (fn: () => Promise<string>) => Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const runRef = useRef(run);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) =>
            runRef.current(async () => {
              const r = await api<SignInResult>("POST", "/auth/google", { idToken: credential });
              return describe(r, "Google");
            }),
        });
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", locale: "ja" });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800">Google</h3>
      <div ref={ref} className="mt-2" />
      {loadError && <p className="mt-2 text-sm text-red-700">{loadError}</p>}
    </div>
  );
}
