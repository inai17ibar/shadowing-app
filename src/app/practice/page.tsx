"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PracticeSession from "@/components/practice/PracticeSession";
import { Loading } from "@/components/practice/ui";

/**
 * /practice?material=<教材ID | text:<自分の文章ID>>&step=<ステップ>
 * 今日の課題・教材・自分の文章・レッスンの宿題から開く練習画面。
 */
export default function PracticePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const params = useSearchParams();
  const material = params.get("material");
  if (!material) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-600">
        練習する教材が指定されていません。
        <Link href="/today" className="text-blue-500 hover:underline ml-1">
          今日の課題へ
        </Link>
      </div>
    );
  }
  return <PracticeSession key={material} materialId={material} initialStep={params.get("step") ?? undefined} />;
}
