/**
 * VOA Learning English のアーカイブから、収録音声つきの教材を取り込む（手元で実行する一括取り込み）。
 *
 *   node scripts/import-voa.ts --section 1579 --pages 1 --limit 5            # .voa-import/ に書き出すだけ
 *   node scripts/import-voa.ts --section 1579 --limit 5 --apply local        # ローカルの R2 / D1 に入れる
 *   node scripts/import-voa.ts --section 1579 --limit 5 --apply remote       # 本番の R2 / D1 に入れる
 *
 * 1. カテゴリの一覧（/z/{section}?p=N）から記事を集める
 * 2. 記事の本文と音声(mp3)を取得し、ffmpeg で 16kHz モノラルに変換して包絡を作る
 * 3. 文と音声の時刻を合わせ（src/lib/audio-align.ts）、約1分のパートに分けて mp3 を切り出す
 * 4. --apply があれば、mp3 を R2 に、教材を D1 に pending_review で入れる
 *
 * 公開は人のレビューを通す（docs/content-collection.md）。
 * 必要なもの: ffmpeg、wrangler（npx）。配信元に負荷をかけないよう、リクエストの間に1秒あける。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { alignSentences, splitIntoParts } from "../src/lib/audio-align.ts";
import { computeEnvelope } from "../src/lib/overlap.ts";
import {
  VOA_HOST,
  VOA_SECTIONS,
  articleSentences,
  buildVoaMaterials,
  materialInsertSql,
  parseArticle,
  parseListing,
  type VoaMaterialRow,
} from "../src/lib/voa.ts";

const { values: args } = parseArgs({
  options: {
    section: { type: "string", default: "1579" },
    pages: { type: "string", default: "1" },
    limit: { type: "string", default: "5" },
    out: { type: "string", default: ".voa-import" },
    apply: { type: "string" },
    bucket: { type: "string", default: "shadowing-media" },
  },
});

const SAMPLE_RATE = 16_000;
const UA = "Mozilla/5.0 (compatible; ShadowingApp/1.0; content import)";
const section = VOA_SECTIONS[args.section!];
if (!section) {
  console.error(`未対応のカテゴリです: ${args.section}（対応: ${Object.keys(VOA_SECTIONS).join(", ")}）`);
  process.exit(1);
}
if (args.apply && args.apply !== "local" && args.apply !== "remote") {
  console.error("--apply は local か remote です");
  process.exit(1);
}

const outDir = args.out!;
const mediaDir = join(outDir, "media");
mkdirSync(join(mediaDir, "voa"), { recursive: true });
mkdirSync(join(outDir, "source"), { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response> {
  await sleep(1000);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

function ffmpeg(...a: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: ["ignore", "ignore", "inherit"] });
}

/** mp3 を 16kHz モノラルの float に変換して包絡にする */
function envelopeOf(mp3: string) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", mp3, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  return computeEnvelope(samples, SAMPLE_RATE);
}

async function collectUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (let p = 0; p < Number(args.pages); p++) {
    const res = await get(`https://${VOA_HOST}/z/${args.section}${p > 0 ? `?p=${p}` : ""}`);
    for (const u of parseListing(await res.text())) if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

async function importArticle(url: string): Promise<VoaMaterialRow[]> {
  const article = parseArticle(await (await get(url)).text(), url);
  if (!article.audioUrl) throw new Error("音声がありません");
  const sentences = articleSentences(article);
  if (sentences.length < 3) throw new Error("本文が短すぎます");

  const source = join(outDir, "source", `${article.articleId}.mp3`);
  if (!existsSync(source)) writeFileSync(source, Buffer.from(await (await get(article.audioUrl)).arrayBuffer()));

  const aligned = alignSentences(envelopeOf(source), sentences, { trailingSignature: article.hasSignature });
  if (!aligned) throw new Error("音声と本文を対応づけられませんでした");
  const parts = splitIntoParts(aligned.timings);
  const rows = buildVoaMaterials(article, sentences, aligned.timings, parts, {
    confidence: aligned.confidence,
    tags: section.tags,
  });

  // パートごとに切り出す（モノラル 64kbps。シャドーイングには十分で、配信量を抑えられる）
  for (const row of rows) {
    ffmpeg(
      "-ss", (row.clip.startMs / 1000).toFixed(3),
      "-to", (row.clip.endMs / 1000).toFixed(3),
      "-i", source,
      "-ac", "1", "-b:a", "64k",
      join(mediaDir, row.audioKey),
    );
  }
  console.log(`  ${article.title}: ${sentences.length}文 → ${rows.length}パート（確かさ ${aligned.confidence}）`);
  return rows;
}

function wrangler(...a: string[]) {
  execFileSync("npx", ["wrangler", ...a], { stdio: "inherit" });
}

const urls = (await collectUrls()).slice(0, Number(args.limit));
console.log(`${section.name}: ${urls.length}件の記事を処理します`);

const rows: VoaMaterialRow[] = [];
for (const url of urls) {
  try {
    rows.push(...(await importArticle(url)));
  } catch (err) {
    console.warn(`  スキップ ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const sqlFile = join(outDir, `materials-${args.section}.sql`);
writeFileSync(sqlFile, rows.map(materialInsertSql).join("\n") + "\n");
writeFileSync(join(outDir, `materials-${args.section}.json`), JSON.stringify(rows, null, 2));
console.log(`教材 ${rows.length}件を ${sqlFile} に書き出しました`);

if (args.apply && rows.length > 0) {
  const where = `--${args.apply}`;
  for (const row of rows) {
    wrangler("r2", "object", "put", `${args.bucket}/${row.audioKey}`, "--file", join(mediaDir, row.audioKey),
      "--content-type", "audio/mpeg", where);
  }
  wrangler("d1", "execute", "DB", "--file", sqlFile, where);
  console.log(`${args.apply} の R2 / D1 に入れました（pending_review）。レビュー後に公開してください`);
}
