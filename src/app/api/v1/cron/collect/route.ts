import { handle, ok } from "@/lib/api/http";
import { requireCron } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { SOURCES, parseFeed, toCandidate, type CandidateDraft } from "@/lib/collect";
import { extractArticle, fetchText } from "@/lib/extract";

/** 1回の実行で1配信元あたり取り込む記事数（配信元への負荷とタイムアウトを抑える） */
const PER_SOURCE = 5;

/**
 * GET /api/v1/cron/collect — 登録済みの配信元から新着記事を教材候補として取り込む。
 * Cloudflare の Cron Trigger（worker.ts の scheduled）から `Authorization: Bearer $CRON_SECRET` で1日1回呼ぶ。
 * オリジナル以外は pending_review で保存され、レビューを経るまで配信されない。
 */
export async function GET(request: Request) {
  return handle(async () => {
    requireCron(request);
    const report: Array<{ source: string; fetched: number; inserted: number; errors: string[] }> = [];

    for (const source of SOURCES.filter((s) => s.active)) {
      const errors: string[] = [];
      const drafts: CandidateDraft[] = [];
      try {
        const { text } = await fetchText(source.feedUrl, 10_000);
        for (const item of parseFeed(text).slice(0, PER_SOURCE)) {
          try {
            const { paragraphs } = await extractArticle(item.url, {
              contentSelector: source.contentSelector,
            });
            const draft = toCandidate(source, item, paragraphs);
            if (draft) drafts.push(draft);
          } catch (err) {
            errors.push(`${item.url}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        errors.push(`feed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const inserted = await getStore().insertMaterialCandidates(drafts);
      report.push({ source: source.id, fetched: drafts.length, inserted, errors });
    }

    return ok({ report });
  });
}
