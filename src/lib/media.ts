/**
 * 教材の収録音声（R2 の MEDIA バケット）を配信する。
 *
 * 音声のシークには Range リクエストが要る（Safari / iOS は Range で取りに来る）ので、
 * R2 の range 読み出しで 206 を返す。キーは取り込み時に決めた形（voa/123.mp3 など）だけを受け付ける。
 */

/** R2 のうち、このアプリが使う部分だけの型（d1.ts と同じく workers-types を入れないため） */
export interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  etag: string;
  httpEtag: string;
  range?: { offset: number; length: number };
}

export interface R2Bucket {
  get(key: string, options?: { range?: { offset: number; length?: number } | { suffix: number } }): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number; httpEtag: string } | null>;
}

const KEY = /^[a-z0-9]+(?:\/[a-z0-9_-]+)*\.mp3$/;

export function isMediaKey(key: string): boolean {
  return KEY.test(key);
}

/** "bytes=100-199" / "bytes=100-" / "bytes=-500" を読む。複数範囲や不正な値は null（全体を返す） */
export function parseRange(header: string | null): { offset: number; length?: number } | { suffix: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };
  const end = Number(m[2]);
  return end >= offset ? { offset, length: end - offset + 1 } : null;
}

const CACHE = "public, max-age=31536000, immutable";

export async function serveMedia(bucket: R2Bucket, key: string, request: Request): Promise<Response> {
  if (!isMediaKey(key)) return new Response("Not found", { status: 404 });

  if (request.method === "HEAD") {
    const head = await bucket.head(key);
    if (!head) return new Response(null, { status: 404 });
    return new Response(null, {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(head.size), "Accept-Ranges": "bytes", ETag: head.httpEtag, "Cache-Control": CACHE },
    });
  }

  const range = parseRange(request.headers.get("Range"));
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
    "Cache-Control": CACHE,
  });
  if (range && object.range) {
    const { offset, length } = object.range;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
