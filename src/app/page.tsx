import Link from "next/link";

const modes = [
  {
    href: "/youtube",
    title: "YouTube動画",
    description:
      "YouTube動画を使ってシャドーイング練習。字幕付きの動画で発音とリスニング力を鍛えましょう。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
      </svg>
    ),
    badge: "動画で練習",
  },
  {
    href: "/reader",
    title: "テキスト読み上げ",
    description:
      "テキストを貼り付けるかURLを入力して、音声読み上げでシャドーイング。発音練習モードも搭載。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    badge: "テキストで練習",
  },
  {
    href: "/library",
    title: "コンテンツライブラリ",
    description:
      "著作権フリーのコンテンツを使ってシャドーイング練習。レベル別の教材で効果的に学習。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
      </svg>
    ),
    badge: "教材で練習",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-14 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 text-sm font-medium text-[var(--brand-from)] mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
          語学力アップ
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
          シャドーイング
          <span className="block bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] bg-clip-text text-transparent">
            練習
          </span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
          聞こえた音声をすぐに真似して話すシャドーイングで、
          リスニング力・発音・流暢さを効果的にトレーニング
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((mode, i) => (
          <Link
            key={mode.href}
            href={mode.href}
            className={`group relative block rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)] focus-visible:ring-offset-2 animate-fade-in-up stagger-${i + 1}`}
          >
            <div className="absolute top-4 right-4">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 group-hover:text-[var(--brand-from)] transition-colors">
                {mode.badge}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 flex items-center justify-center mb-4 text-[var(--brand-from)] group-hover:from-[var(--brand-from)] group-hover:to-[var(--brand-to)] group-hover:text-white transition-all duration-300">
              {mode.icon}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-[var(--brand-from)] transition-colors">
              {mode.title}
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              {mode.description}
            </p>
            <div className="mt-4 flex items-center text-sm font-medium text-[var(--brand-from)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              始める
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
