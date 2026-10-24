"use client";

/**
 * 英文に「音の変化」（連結・同化・脱落）の印を付けて表示する。
 *
 * - 連結・同化: 語と語の間に「‿」を出し、つなげて読む所だと分かるようにする
 * - 脱落: 飲み込む語末の文字を薄くする
 * - 録音の判定で途切れていた所（broken）は赤で示す
 */
import { useSyncExternalStore } from "react";
import {
  SOUND_CHANGE_LABELS,
  findSoundChanges,
  tokenize,
  type SoundChange,
  type SoundChangeCheck,
  type SoundChangeKind,
} from "@/lib/sound-changes";

const LINK_COLORS: Record<Exclude<SoundChangeKind, "elision">, string> = {
  linking: "text-blue-500",
  assimilation: "text-green-600",
};

export function SoundChangeText({
  text,
  checks,
  className = "",
}: {
  text: string;
  /** 録音の判定結果。無ければ文から見つけた変化だけを表示する */
  checks?: SoundChangeCheck[];
  className?: string;
}) {
  const tokens = tokenize(text);
  const changes: Array<SoundChange | SoundChangeCheck> = checks ?? findSoundChanges(text);
  const byWord = new Map(changes.map((c) => [c.wordIndex, c]));

  const parts: React.ReactNode[] = [];
  let pos = 0;
  tokens.forEach((t, i) => {
    const change = byWord.get(i);
    const elided = change?.kind === "elision";
    // 前の語との間（空白・句読点）はそのまま出す
    const prevChange = byWord.get(i - 1);
    const between = text.slice(pos, t.start);
    if (prevChange && prevChange.kind !== "elision") {
      const broken = "result" in prevChange && prevChange.result === "broken";
      parts.push(
        <span
          key={`l${i}`}
          title={`${SOUND_CHANGE_LABELS[prevChange.kind]}: ${prevChange.hint}`}
          className={`mx-px font-semibold ${broken ? "rounded bg-red-50 px-0.5 text-red-600" : LINK_COLORS[prevChange.kind]}`}
        >
          ‿
        </span>,
      );
    } else {
      parts.push(between);
    }
    if (elided) {
      parts.push(t.text.slice(0, -1));
      parts.push(
        <span key={`e${i}`} title={`${SOUND_CHANGE_LABELS.elision}: ${change.hint}`} className="opacity-35">
          {t.text.slice(-1)}
        </span>,
      );
    } else {
      parts.push(t.text);
    }
    pos = t.end;
  });
  parts.push(text.slice(pos));

  return (
    <span lang="en" className={className}>
      {parts}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 解説（読み方のコツの一覧）を表示するかどうか。端末ごとに覚えておく
// ---------------------------------------------------------------------------

const HINTS_KEY = "shadowing:sound-change-hints";
const HINTS_EVENT = "shadowing:sound-change-hints";

function readHints(): boolean {
  try {
    return localStorage.getItem(HINTS_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function subscribeHints(onChange: () => void) {
  window.addEventListener(HINTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HINTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 解説を表示するか（既定は表示）と、その切り替え。同じ画面の他の一覧にもすぐ反映する */
export function useSoundChangeHints(): [boolean, (show: boolean) => void] {
  const show = useSyncExternalStore(subscribeHints, readHints, () => true);
  const set = (next: boolean) => {
    try {
      if (next) localStorage.removeItem(HINTS_KEY);
      else localStorage.setItem(HINTS_KEY, "hidden");
    } catch {
      // 保存できなくても、この画面の表示は切り替える
    }
    window.dispatchEvent(new Event(HINTS_EVENT));
  };
  return [show, set];
}

/** 「解説を隠す / 表示」の切り替えボタン */
export function SoundChangeHintsToggle() {
  const [show, setShow] = useSoundChangeHints();
  return (
    <button type="button" onClick={() => setShow(!show)} className="text-xs text-blue-500 hover:underline">
      {show ? "解説を隠す" : "解説を表示"}
    </button>
  );
}

/** 印の意味（と、解説の表示切り替え） */
export function SoundChangeLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      <span>
        <span className="font-semibold text-blue-500">‿</span> 連結（つなげる）
      </span>
      <span>
        <span className="font-semibold text-green-600">‿</span> 同化（混ざって別の音に）
      </span>
      <span>
        <span className="opacity-35">d</span> 脱落（ほとんど発音しない）
      </span>
      <span className="ml-auto">
        <SoundChangeHintsToggle />
      </span>
    </p>
  );
}

/**
 * 文の中の音の変化と読み方の一覧。解説を隠す設定のときは出さない
 * （force: 録音の判定で途切れていた所のように、隠さずに見せたいもの）
 */
export function SoundChangeList({
  changes,
  force = false,
}: {
  changes: Array<SoundChange | SoundChangeCheck>;
  force?: boolean;
}) {
  const [show] = useSoundChangeHints();
  if (changes.length === 0 || (!show && !force)) return null;
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((c) => {
        const broken = "result" in c && c.result === "broken";
        return (
          <li key={`${c.kind}:${c.wordIndex}`} className="flex gap-2">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                broken
                  ? "bg-red-50 text-red-700"
                  : c.kind === "linking"
                    ? "bg-blue-50 text-blue-700"
                    : c.kind === "assimilation"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
              }`}
            >
              {broken ? "途切れ" : SOUND_CHANGE_LABELS[c.kind]}
            </span>
            <span className="text-gray-700">
              <span lang="en" className="font-medium text-gray-900">
                {c.label}
              </span>{" "}
              {c.hint}
              {broken && "gapMs" in c && <span className="text-red-600">（{c.gapMs}ms 空いていました）</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
