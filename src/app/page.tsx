import Link from "next/link";

const modes = [
  {
    href: "/youtube",
    title: "YouTube動画",
    description: "YouTube動画を使ってシャドーイング練習。字幕付きの動画で発音とリスニング力を鍛えましょう。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
      </svg>
    ),
  },
  {
    href: "/reader",
    title: "テキスト読み上げ",
    description: "テキストを貼り付けるかURLを入力して、音声読み上げでシャドーイング。自分のペースで練習できます。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    href: "/library",
    title: "コンテンツライブラリ",
    description: "著作権フリーのコンテンツを使ってシャドーイング練習。VOAなどの教材で効果的に学習しましょう。",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          シャドーイング練習
        </h1>
        <p className="text-gray-600 text-lg">
          練習モードを選んでシャドーイングを始めましょう
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modes.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
          >
            <div className="mb-4 text-[#667eea] group-hover:text-[#764ba2] transition-colors">
              {mode.icon}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {mode.title}
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              {mode.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
