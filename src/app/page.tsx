import Link from "next/link";
import { LogoMark } from "@/components/SiteNav";

const STEPS = ["聞き取り", "スクリプト", "マンブリング", "オーバーラッピング", "シャドーイング", "本番録音"];

const TILES = [
  {
    href: "/catalog",
    eyebrow: "教材",
    title: "レベル別の教材で。",
    body: "出典とライセンスを確かめた英文を、初級から上級まで。",
  },
  {
    href: "/texts",
    eyebrow: "自分の文章",
    title: "読みたい英文を、そのまま教材に。",
    body: "貼り付けるか URL を入れるだけ。あなただけの練習用に保存します。",
  },
  {
    href: "/progress",
    eyebrow: "記録",
    title: "続けた日が、見える。",
    body: "連続日数と日々の練習量、本番録音の点数の推移。",
  },
];

const TOOLS = [
  { href: "/youtube", title: "YouTube", body: "字幕付きの動画で練習" },
  { href: "/reader", title: "テキスト読み上げ", body: "貼り付けた文章を読み上げて練習" },
  { href: "/library", title: "ライブラリ", body: "収録済みの短い教材" },
];

/** 音の重なりを表す2本の波形（お手本と自分） */
function Waveform() {
  const ref = [4, 9, 16, 24, 30, 22, 14, 20, 28, 34, 26, 18, 10, 16, 24, 30, 20, 12, 8, 14, 22, 28, 18, 9, 5];
  const you = ref.map((h, i) => Math.max(3, Math.round(h * (0.75 + 0.25 * Math.sin(i * 1.7)))));
  const bars = (hs: number[], cls: string, dx: number) =>
    hs.map((h, i) => (
      <rect key={i} x={i * 12 + dx} y={40 - h} width="5" height={h * 2} rx="2.5" className={cls} />
    ));
  return (
    <svg viewBox="0 0 300 80" className="mx-auto w-full max-w-md" aria-hidden>
      {bars(ref, "fill-gray-300", 0)}
      {bars(you, "fill-blue-500", 5)}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="pb-20">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 pt-16 pb-12 text-center md:pt-24 animate-fade-in">
        <LogoMark className="mx-auto mb-5 size-12" />
        <h1 className="text-[44px] leading-[1.08] font-bold tracking-tight text-gray-900 md:text-[64px]">
          聞いて、<br className="md:hidden" />
          すぐ真似る。
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[19px] leading-relaxed text-gray-600 md:text-[21px]">
          お手本の音にどれだけ重ねて話せたかを、その場で採点。
          <br className="hidden md:block" />
          毎日6ステップのシャドーイングで、話せる耳と口をつくります。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link
            href="/today"
            className="rounded-full bg-blue-500 px-6 py-3 text-[17px] font-medium text-white transition-colors hover:bg-blue-600"
          >
            今日の課題をはじめる
          </Link>
          <Link href="/catalog" className="text-[17px] text-blue-500 hover:underline">
            教材を見る ›
          </Link>
        </div>
      </section>

      {/* 重なり採点 */}
      <section className="mx-auto max-w-5xl px-4">
        <div className="rounded-3xl bg-surface px-6 py-12 text-center shadow-card md:py-16 animate-fade-in-up">
          <p className="text-[15px] font-semibold text-blue-500">重なり採点</p>
          <h2 className="mt-2 text-[32px] leading-tight font-bold tracking-tight text-gray-900 md:text-[40px]">
            ズレも、リズムも、<br className="md:hidden" />話す速さも。
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-gray-600">
            音声はサーバーに送らず、端末の中で波形を重ねて比べます。
          </p>
          <div className="mt-10">
            <Waveform />
            <div className="mt-4 flex justify-center gap-5 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-gray-300" /> お手本
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" /> あなた
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 6ステップ */}
      <section className="mx-auto mt-5 max-w-5xl px-4">
        <div className="rounded-3xl bg-[#1d1d1f] px-6 ring-1 ring-white/5 py-12 text-center md:py-16">
          <p className="text-[15px] font-semibold text-[#2997ff]">毎日の6ステップ</p>
          <h2 className="mt-2 text-[32px] leading-tight font-bold tracking-tight text-white md:text-[40px]">
            同じ教材を、身につくまで。
          </h2>
          <ol className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-full bg-white/10 px-4 py-2 text-[15px] text-white/90">
                <span className="mr-1.5 tabular-nums text-white/50">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* タイル */}
      <section className="mx-auto mt-5 grid max-w-5xl gap-5 px-4 md:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex flex-col rounded-3xl bg-surface p-7 shadow-card transition-transform duration-300 hover:scale-[1.015]"
          >
            <p className="text-[13px] font-semibold text-gray-500">{t.eyebrow}</p>
            <h3 className="mt-2 text-[24px] leading-snug font-bold tracking-tight text-gray-900">{t.title}</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-gray-600">{t.body}</p>
            <span className="mt-6 text-[15px] text-blue-500 group-hover:underline">詳しく ›</span>
          </Link>
        ))}
      </section>

      {/* その他の練習 */}
      <section className="mx-auto mt-16 max-w-5xl px-4">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-gray-500">ほかの練習</h2>
        <ul className="mt-2 divide-y divide-separator overflow-hidden rounded-2xl bg-surface shadow-card">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] text-gray-900">{t.title}</p>
                  <p className="text-[13px] text-gray-500">{t.body}</p>
                </div>
                <span className="text-gray-400" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
