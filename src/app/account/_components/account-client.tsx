"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ensureSession, errorMessage, forgetSession, type Profile, type SessionUser } from "@/lib/client/api";
import { flushPending, pendingCount } from "@/lib/client/attempt-queue";
import { Button, formatDateTime, inputClass, Notice, Section, type NoticeState } from "./ui";
import { SignInMethods, type AuthMethods } from "./sign-in-methods";

interface Identities {
  isAnonymous: boolean;
  identities: { provider: "apple" | "google" | "email"; email: string | null; createdAt: string }[];
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
}

const PROVIDER_LABELS = { apple: "Apple", google: "Google", email: "メール" } as const;

const LEVELS: { value: Profile["level"]; label: string }[] = [
  { value: "beginner", label: "初級" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

type Loaded = { user: SessionUser; identities: Identities; methods: AuthMethods } | { error: string };

async function load(): Promise<Loaded> {
  try {
    const user = await ensureSession();
    const [identities, methods] = await Promise.all([
      api<Identities>("GET", "/me/identities"),
      api<AuthMethods>("GET", "/auth/methods"),
    ]);
    return { user, identities, methods };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export default function AccountClient() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [identities, setIdentities] = useState<Identities | null>(null);
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apply = useCallback((r: Loaded) => {
    if ("error" in r) {
      setLoadError(r.error);
      return;
    }
    setUser(r.user);
    setIdentities(r.identities);
    setMethods(r.methods);
    setLoadError(null);
  }, []);

  /** セッション・ログイン方法を読み直す（サインインや方法の追加・削除のあと） */
  const reload = useCallback(async () => apply(await load()), [apply]);

  useEffect(() => {
    let cancelled = false;
    load().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (loadError) {
    return (
      <Page>
        <Notice notice={{ kind: "error", text: loadError }} />
        <Button className="mt-4" onClick={() => void reload()}>
          再読み込み
        </Button>
      </Page>
    );
  }
  if (!user || !identities || !methods) {
    return (
      <Page>
        <p className="text-sm text-gray-500">読み込み中…</p>
      </Page>
    );
  }

  return (
    <Page>
      <Status user={user} />
      <Section
        title="ログイン方法"
        description={
          user.isAnonymous
            ? "いまは匿名で使っています。ログイン方法を追加すると、別の端末（iOSアプリ等）からも同じ記録を使えます。"
            : "登録済みのログイン方法です。最後の1つは外せません。"
        }
      >
        <LinkedMethods identities={identities} onChanged={reload} />
        <div className="mt-6 border-t border-gray-100 pt-6">
          <SignInMethods methods={methods} hasPasskeys={identities.passkeys.length > 0} onSignedIn={reload} />
        </div>
      </Section>
      <ProfileForm key={user.id} profile={user.profile} onSaved={setUser} />
      <Sync />
      <SignOut isAnonymous={user.isAnonymous} />
      <DeleteAccount />
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight text-gray-900 text-gray-900">アカウント</h1>
      {children}
    </div>
  );
}

function Status({ user }: { user: SessionUser }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface shadow-card px-6 py-4">
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          user.isAnonymous ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
        }`}
      >
        {user.isAnonymous ? "匿名" : "本登録"}
      </span>
      <span className="text-sm text-gray-500">
        ID: <code className="font-mono">{user.id.slice(0, 8)}</code>
      </span>
      <span className="text-sm text-gray-500">作成: {formatDateTime(user.profile.createdAt)}</span>
    </div>
  );
}

function LinkedMethods({ identities, onChanged }: { identities: Identities; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  async function remove(path: string, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api("DELETE", path);
      await onChanged();
      setNotice({ kind: "success", text: done });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (identities.identities.length === 0 && identities.passkeys.length === 0) {
    return <p className="text-sm text-gray-500">まだログイン方法がありません。</p>;
  }

  return (
    <div>
      <ul className="divide-y divide-gray-100">
        {identities.identities.map((i) => (
          <li key={i.provider} className="flex items-center justify-between gap-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-gray-900">{PROVIDER_LABELS[i.provider]}</span>
              {i.email && <span className="ml-2 text-gray-500">{i.email}</span>}
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => remove(`/me/identities/${i.provider}`, `${PROVIDER_LABELS[i.provider]}を外しました`)}
            >
              外す
            </Button>
          </li>
        ))}
        {identities.passkeys.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-gray-900">パスキー</span>
              <span className="ml-2 text-gray-500">{p.name || "名前なし"}</span>
              <span className="ml-2 text-xs text-gray-400">最終使用: {formatDateTime(p.lastUsedAt)}</span>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => remove(`/me/passkeys/${encodeURIComponent(p.id)}`, "パスキーを削除しました")}
            >
              削除
            </Button>
          </li>
        ))}
      </ul>
      <Notice notice={notice} />
    </div>
  );
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (u: SessionUser) => void }) {
  const [level, setLevel] = useState(profile.level);
  const [goal, setGoal] = useState(String(profile.dailyGoalMinutes));
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const u = await api<SessionUser>("PATCH", "/me", {
        level,
        dailyGoalMinutes: Number(goal),
        timeZone: timeZone.trim(),
      });
      onSaved(u);
      setNotice({ kind: "success", text: "保存しました" });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="プロフィール" description="今日の課題の教材レベルと、1日の目標時間です。">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          レベル
          <select value={level} onChange={(e) => setLevel(e.target.value as Profile["level"])} className={inputClass}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          1日の目標（分）
          <input
            type="number"
            min={5}
            max={180}
            required
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          タイムゾーン
          <input
            required
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            placeholder={browserTz}
            className={inputClass}
          />
          {browserTz && browserTz !== timeZone && (
            <button type="button" className="text-left text-xs text-blue-500 hover:underline" onClick={() => setTimeZone(browserTz)}>
              このブラウザの設定（{browserTz}）にする
            </button>
          )}
        </label>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={busy}>
            保存
          </Button>
        </div>
      </form>
      <Notice notice={notice} />
    </Section>
  );
}

function Sync() {
  // localStorage はブラウザでしか読めないので、マウント後に数える
  const [count, setCount] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setCount(pendingCount()), 0);
    return () => clearTimeout(id);
  }, []);

  async function flush() {
    setBusy(true);
    setNotice(null);
    try {
      const left = await flushPending();
      setCount(left);
      setNotice(left === 0 ? { kind: "success", text: "すべて送りました" } : { kind: "info", text: `${left}件を送れませんでした。通信できるときにもう一度お試しください` });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="同期" description="通信できないときに練習した記録は、このブラウザに溜めておき、あとでまとめて送ります。">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-700">送信待ち: {count === null ? "—" : `${count}件`}</span>
        <Button variant="secondary" disabled={busy || !count} onClick={() => void flush()}>
          今すぐ送る
        </Button>
      </div>
      <Notice notice={notice} />
    </Section>
  );
}

function SignOut({ isAnonymous }: { isAnonymous: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api("POST", "/auth/logout", {});
      forgetSession();
      // 次に開いたとき、新しい匿名アカウントが作られる
      window.location.reload();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <Section
      title="サインアウト"
      description="サインアウトすると、次に開いたときは新しい匿名アカウントで始まります。"
    >
      {isAnonymous && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          いまは匿名です。ログイン方法を追加せずにサインアウトすると、この記録には二度と戻れません。
        </p>
      )}
      {!confirming ? (
        <Button variant="secondary" onClick={() => (isAnonymous ? setConfirming(true) : void signOut())} disabled={busy}>
          サインアウト
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={busy} onClick={() => void signOut()}>
            記録を失ってもサインアウトする
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            やめる
          </Button>
        </div>
      )}
      <Notice notice={notice} />
    </Section>
  );
}

function DeleteAccount() {
  const [step, setStep] = useState<0 | 1>(0);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const PHRASE = "削除";

  async function remove() {
    setBusy(true);
    try {
      await api("DELETE", "/me");
      forgetSession();
      window.location.reload();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <Section
      title="アカウントの削除"
      description="アカウントと、練習記録・自分の文章をすべて削除します。元に戻せません。"
    >
      {step === 0 ? (
        <Button variant="danger" onClick={() => setStep(1)}>
          アカウントを削除する
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            確認のため「<strong>{PHRASE}</strong>」と入力してください。
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} aria-label="確認の入力" />
            <Button variant="danger" disabled={busy || typed !== PHRASE} onClick={() => void remove()}>
              完全に削除する
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setStep(0);
                setTyped("");
              }}
            >
              やめる
            </Button>
          </div>
        </div>
      )}
      <Notice notice={notice} />
    </Section>
  );
}
