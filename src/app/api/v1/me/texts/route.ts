import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { splitSentences } from "@/lib/content-policy";
import { extractArticle, ExtractError } from "@/lib/extract";

const MAX_SENTENCES = 200;
const MAX_CHARS = 20_000;

// GET /api/v1/me/texts — 自分で取り込んだ文章の一覧
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    return ok({ items: await getStore().listTexts(user.id) });
  });
}

/**
 * POST /api/v1/me/texts — 自分の文章を取り込む。
 *   { "text": "...", "title": "..." }  貼り付けた文章（iOSの共有シートから渡されたもの等）
 *   { "url": "https://..." }           Webページの本文
 *
 * 取り込んだ文章は本人のアカウントの中だけで使う私的利用で、共有カタログには載せない
 * （docs/content-collection.md）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);

    let title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    let sourceUrl = "";
    let paragraphs: string[];

    if (typeof body.url === "string" && body.url) {
      try {
        const article = await extractArticle(body.url);
        paragraphs = article.paragraphs;
        title ||= article.title.slice(0, 200);
        sourceUrl = body.url;
      } catch (err) {
        if (err instanceof ExtractError) {
          throw new ApiError(err.kind === "upstream" ? "upstream_error" : "bad_request", err.message);
        }
        throw new ApiError("upstream_error", "ページを取得できませんでした");
      }
    } else if (typeof body.text === "string" && body.text.trim()) {
      paragraphs = body.text.split(/\n+/);
    } else {
      throw new ApiError("bad_request", "text か url のどちらかを送ってください");
    }

    if (paragraphs.join("\n").length > MAX_CHARS) {
      throw new ApiError("unprocessable", `文章が長すぎます（${MAX_CHARS}文字まで）`);
    }
    const sentences = splitSentences(paragraphs).slice(0, MAX_SENTENCES);
    if (sentences.length === 0) throw new ApiError("unprocessable", "本文が見つかりませんでした");

    const saved = await getStore().insertText(user.id, {
      title: title || sentences[0].slice(0, 60),
      sourceUrl,
      sentences,
    });
    return ok(saved, { status: 201 });
  });
}
