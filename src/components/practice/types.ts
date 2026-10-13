/**
 * Web版の練習画面が受け取る /api/v1 のレスポンスの形（docs/openapi.yaml と同じ）。
 */
export type Level = "beginner" | "intermediate" | "advanced";
export type StepId = "listen" | "script" | "mumbling" | "overlapping" | "shadowing" | "record";

export interface PracticeStep {
  id: StepId;
  title: string;
  instruction: string;
  minutes: number;
  scored: boolean;
}

export interface StepsResponse {
  steps: PracticeStep[];
  masteryScore: number;
  maxDaysPerMaterial: number;
}

export interface Sentence {
  text: string;
  translation?: string;
  startMs?: number;
  endMs?: number;
}

export interface MaterialSummary {
  id: string;
  title: string;
  level: Level;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  license: string;
  attribution: string | null;
  audioUrl: string | null;
  publishedAt: string | null;
  sentenceCount: number;
}

export type Material = Omit<MaterialSummary, "sentenceCount"> & { sentences: Sentence[] };

export interface UserText {
  id: string;
  title: string;
  sourceUrl: string;
  sentences: string[];
  createdAt: string;
}

export interface UserTextSummary {
  id: string;
  title: string;
  sourceUrl: string;
  createdAt: string;
}

export interface TodayStep extends PracticeStep {
  done: boolean;
  bestScore: number | null;
}

export type TodayResponse =
  | { status: "exhausted"; message: string; streak: number }
  | {
      status: "active";
      date: string;
      material: { id: string; title: string; level: Level; sentenceCount: number; audioUrl: string | null } | null;
      advancedReason: string | null;
      levelChanged: boolean;
      level: Level;
      materialId: string;
      day: number;
      steps: TodayStep[];
      nextStep: StepId | null;
      todayRecordScore: number | null;
      weakSentences: { sentenceIndex: number; averageScore: number; attempts: number }[];
      streak: number;
      goalMinutes: number;
    };

export interface Attempt {
  id: string;
  materialId: string;
  step: StepId;
  sentenceIndex: number | null;
  score: number | null;
  lagMs: number | null;
  rhythm: number | null;
  rateRatio: number | null;
  coverage: number | null;
  durationMs: number | null;
  createdAt: string;
  receivedAt: string;
}
