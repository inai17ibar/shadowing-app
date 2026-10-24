/**
 * 発音採点のロジック。
 *
 * ルートハンドラから切り出した純関数。I/O を含めないことでテストできるようにしている。
 * ここに音声は届かない — 入力は目標文と音声認識の結果テキストだけである点に注意。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PronunciationRequest {
  target: string;
  transcript: string;
}

interface PronunciationFeedback {
  score: number;
  feedback: string;
  details: {
    missed: string[];
    added: string[];
    correct: string[];
  };
}

// ---------------------------------------------------------------------------
// Simple word-level diff (fallback when no API key is configured)
// ---------------------------------------------------------------------------
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function diffBasedFeedback(
  target: string,
  transcript: string,
): PronunciationFeedback {
  const targetWords = normalizeWords(target);
  const transcriptWords = normalizeWords(transcript);

  const targetSet = new Set(targetWords);
  const transcriptSet = new Set(transcriptWords);

  const correct = targetWords.filter((w) => transcriptSet.has(w));
  const missed = targetWords.filter((w) => !transcriptSet.has(w));
  const added = transcriptWords.filter((w) => !targetSet.has(w));

  // Deduplicate while preserving order
  const uniqueCorrect = [...new Set(correct)];
  const uniqueMissed = [...new Set(missed)];
  const uniqueAdded = [...new Set(added)];

  const score =
    targetWords.length === 0
      ? 0
      : Math.round((correct.length / targetWords.length) * 100);

  const feedback =
    score === 100
      ? "完璧です！全ての単語が正しく発音されました。"
      : score >= 70
        ? `良い調子です！いくつかの単語を見直しましょう：${uniqueMissed.join(", ")}`
        : `もう少し練習しましょう。抜けている単語：${uniqueMissed.join(", ")}`;

  return {
    score,
    feedback,
    details: {
      missed: uniqueMissed,
      added: uniqueAdded,
      correct: uniqueCorrect,
    },
  };
}

export type { PronunciationRequest, PronunciationFeedback }
export { normalizeWords, diffBasedFeedback }
