"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ensureSession, errorMessage } from "@/lib/client/api";
import type { Material } from "@/components/practice/types";
import {
  ErrorBox,
  LevelBadge,
  Loading,
  Notice,
  card,
  practiceHref,
  primaryButton,
  secondaryButton,
} from "@/components/practice/ui";

const LICENSE_LABELS: Record<string, string> = {
  original: "オリジナル",
  "public-domain": "パブリックドメイン",
  cc0: "CC0",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
  licensed: "許諾済み",
};

const REASONS = [
  { value: "incorrect", label: "内容・訳の誤り" },
  { value: "audio_problem", label: "音声の問題" },
  { value: "inappropriate", label: "不適切な内容" },
  { value: "copyright", label: "著作権の侵害" },
  { value: "other", label: "その他" },
];

// GET /api/v1/materials/{id} — 教材の本文と出典。POST /reports で通報できる
export default function CatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<Material>("GET", `/materials/${encodeURIComponent(id)}`)
      .then((m) => !cancelled && setMaterial(m))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/catalog" className="text-sm text-gray-500 hover:text-blue-500">
        ← 教材一覧
      </Link>
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
      {!error && !material && <Loading />}
      {material && (
        <>
          <div className="flex items-center gap-2 mt-4 mb-1">
            <LevelBadge level={material.level} />
            {material.tags.map((t) => (
              <span key={t} className="text-xs text-gray-400">
                #{t}
              </span>
            ))}
          </div>
          <h1 className="text-[32px] leading-tight font-bold tracking-tight text-gray-900 mb-2">{material.title}</h1>
          {material.description && <p className="text-gray-500 text-sm mb-4">{material.description}</p>}

          <dl className="text-xs text-gray-500 space-y-1 mb-6">
            <div>
              <dt className="inline">出典: </dt>
              <dd className="inline">
                {material.sourceUrl ? (
                  <a href={material.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {material.sourceName}
                  </a>
                ) : (
                  material.sourceName
                )}
              </dd>
            </div>
            <div>
              <dt className="inline">ライセンス: </dt>
              <dd className="inline">{LICENSE_LABELS[material.license] ?? material.license}</dd>
            </div>
            {material.attribution && (
              <div>
                <dt className="inline">帰属表示: </dt>
                <dd className="inline">{material.attribution}</dd>
              </div>
            )}
          </dl>

          <Link href={practiceHref(material.id)} className={primaryButton}>
            練習する
          </Link>

          <section className={`${card} mt-8`}>
            <h2 className="font-semibold text-gray-900 mb-3">スクリプト（{material.sentences.length}文）</h2>
            <ol className="space-y-3">
              {material.sentences.map((s, i) => (
                <li key={i}>
                  <p className="text-gray-900 leading-relaxed">{s.text}</p>
                  {s.translation && <p className="text-sm text-gray-500">{s.translation}</p>}
                </li>
              ))}
            </ol>
          </section>

          <ReportForm materialId={material.id} />
        </>
      )}
    </div>
  );
}

function ReportForm({ materialId }: { materialId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await ensureSession();
      await api("POST", "/reports", { targetType: "material", targetId: materialId, reason, detail });
      setState("sent");
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="mt-8">
        <Notice>通報を受け付けました。確認して対応します。</Notice>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="mt-8">
        <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">
          この教材の問題を報告する
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className={`${card} mt-8 space-y-3`}>
      <h2 className="font-semibold text-gray-900">問題を報告</h2>
      <label className="block text-sm text-gray-700">
        理由
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 block w-full rounded-xl border-0 bg-gray-100 px-2 py-2 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-gray-700">
        詳しく（任意）
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 block w-full rounded-xl border-0 bg-gray-100 p-2 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
      </label>
      {error && <ErrorBox message={error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={state === "sending"} className={primaryButton}>
          {state === "sending" ? "送信中…" : "送信"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
          やめる
        </button>
      </div>
    </form>
  );
}
