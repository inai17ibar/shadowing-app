"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SESSION_EXPIRED_EVENT,
  dismissSessionExpiredNotice,
  sessionExpiredNotice,
} from "@/lib/client/api";

/** 本登録のログインが切れて匿名で始め直したときの案内（全ページ共通） */
export default function SessionNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => setShow(sessionExpiredNotice());
    update();
    window.addEventListener(SESSION_EXPIRED_EVENT, update);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, update);
  }, []);

  if (!show) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          ログインの有効期限が切れたため、いまは匿名で使っています。サインインし直すと、この間の記録も引き継がれます。
        </span>
        <Link href="/account" className="font-medium underline">
          サインインする
        </Link>
        <button
          type="button"
          className="ml-auto text-amber-700 hover:text-amber-900"
          onClick={() => {
            dismissSessionExpiredNotice();
            setShow(false);
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
