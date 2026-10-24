"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ensureSession, errorMessage } from "@/lib/client/api";
import type { UserText, UserTextSummary } from "@/components/practice/types";
import { ErrorBox, Loading, card, practiceHref, primaryButton, secondaryButton } from "@/components/practice/ui";

type Mode = "text" | "url";

// /api/v1/me/texts — 自分で取り込んだ文章（本人だけが見られる）
export default function TextsPage() {
  const [items, setItems] = useState<UserTextSummary[] | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSession();
        const r = await api<{ items: UserTextSummary[] }>("GET", "/me/texts");
        if (!cancelled) setItems(r.items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(id: string) {
    setDeleting(id);
    setError("");
    try {
      await api("DELETE", `/me/texts/${encodeURIComponent(id)}`);
      setItems((prev) => prev?.filter((t) => t.id !== id) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  function added(t: UserText) {
    setItems((prev) => [
      { id: t.id, title: t.title, sourceUrl: t.sourceUrl, createdAt: t.createdAt },
      ...(prev ?? []),
    ]);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight text-gray-900 mb-2">自分の文章</h1>
      <p className="text-gray-500 text-sm mb-6">
        貼り付けた文章やWebページの本文を、自分専用の練習教材にします。他の人には公開されません。
        レッスンの宿題で作られた「言い直し」もここに入ります。
      </p>

      <AddForm onAdded={added} />

      {error && (
        <div className="mt-6">
          <ErrorBox message={error} />
        </div>
      )}
      {!items && !error && <Loading />}
      {items && items.length === 0 && (
        <p className="text-sm text-gray-500 py-10 text-center">まだ文章がありません。</p>
      )}

      <ul className="space-y-3 mt-8">
        {items?.map((t) => (
          <li key={t.id} className={`${card} flex items-start justify-between gap-4`}>
            <div className="min-w-0">
              <h2 className="font-medium text-gray-900 truncate">{t.title || "（無題）"}</h2>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(t.createdAt).toLocaleDateString("ja-JP")}
                {t.sourceUrl && (
                  <>
                    {" · "}
                    <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">
                      {t.sourceUrl}
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {confirming === t.id ? (
                <>
                  <span className="text-xs text-gray-600">削除しますか？</span>
                  <button
                    onClick={() => remove(t.id)}
                    disabled={deleting === t.id}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {deleting === t.id ? "削除中…" : "削除"}
                  </button>
                  <button onClick={() => setConfirming(null)} className="text-xs text-gray-500 hover:underline">
                    やめる
                  </button>
                </>
              ) : (
                <>
                  <Link href={practiceHref(`text:${t.id}`)} className={secondaryButton}>
                    練習する
                  </Link>
                  <button
                    onClick={() => setConfirming(t.id)}
                    aria-label={`${t.title}を削除`}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: (t: UserText) => void }) {
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const body = mode === "text" ? { text, title } : { url, title };
      const saved = await api<UserText>("POST", "/me/texts", body);
      onAdded(saved);
      setTitle("");
      setText("");
      setUrl("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const ready = mode === "text" ? text.trim().length > 0 : /^https?:\/\//.test(url.trim());

  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <div className="flex gap-2">
        {(["text", "url"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              mode === m ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {m === "text" ? "文章を貼る" : "URLから"}
          </button>
        ))}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル（省略可）"
        maxLength={200}
        className="block w-full rounded-xl border-0 bg-gray-100 px-3 py-2 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
      />
      {mode === "text" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="英文を貼り付け（20,000文字まで）"
          maxLength={20_000}
          rows={6}
          className="block w-full rounded-xl border-0 bg-gray-100 p-3 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      ) : (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="block w-full rounded-xl border-0 bg-gray-100 px-3 py-2 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      )}
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={sending || !ready} className={primaryButton}>
        {sending ? "取り込み中…" : "取り込む"}
      </button>
    </form>
  );
}
