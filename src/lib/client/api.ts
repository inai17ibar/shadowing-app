/**
 * Web版から /api/v1 を呼ぶクライアント（ブラウザ専用）。
 *
 * トークンは httpOnly の Cookie にあり、JavaScript からは触れない（src/lib/api/web-session.ts）。
 * - アクセストークンが切れていたら（401）、一度だけ /auth/refresh してから呼び直す
 * - まだセッションが無ければ ensureSession() が匿名サインインする（iOS の初回起動と同じ）
 */

const BASE = "/api/v1";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 通信できなかった（オフライン等）。サーバーからのエラーとは区別する */
export class NetworkError extends Error {}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function raw(method: Method, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(BASE + path, {
      method,
      credentials: "same-origin",
      headers: {
        "x-client": "web",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError("サーバーに接続できませんでした");
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiClientError(res.status, e.code ?? "internal", e.message ?? `エラー（${res.status}）`);
  }
  return data as T;
}

let refreshing: Promise<boolean> | null = null;

/** Cookie のリフレッシュトークンで新しいトークンをもらう。同時に何本も呼ばない */
export function refreshSession(): Promise<boolean> {
  refreshing ??= raw("POST", "/auth/refresh", {})
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await refreshSession()) res = await raw(method, path, body);
  }
  return parse<T>(res);
}

export interface SessionUser {
  id: string;
  isAnonymous: boolean;
  profile: Profile;
}

export interface Profile {
  level: "beginner" | "intermediate" | "advanced";
  dailyGoalMinutes: number;
  timeZone: string;
  createdAt: string;
}

let ensuring: Promise<SessionUser> | null = null;

const REGISTERED_KEY = "shadowing.wasRegistered";
const EXPIRED_KEY = "shadowing.sessionExpired";
export const SESSION_EXPIRED_EVENT = "shadowing:session-expired";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 本登録のセッションが切れて匿名で始め直したか（画面上部の案内に使う） */
export function sessionExpiredNotice(): boolean {
  return storage()?.getItem(EXPIRED_KEY) === "1";
}

/** 自分でサインアウト・退会したとき。次に匿名で始めても「期限切れ」の案内を出さない */
export function forgetSession() {
  storage()?.removeItem(REGISTERED_KEY);
  storage()?.removeItem(EXPIRED_KEY);
}

export function dismissSessionExpiredNotice() {
  storage()?.removeItem(EXPIRED_KEY);
}

function remember(user: SessionUser): SessionUser {
  const s = storage();
  if (!s) return user;
  if (user.isAnonymous) {
    s.removeItem(REGISTERED_KEY);
  } else {
    s.setItem(REGISTERED_KEY, "1");
    if (s.getItem(EXPIRED_KEY)) {
      s.removeItem(EXPIRED_KEY);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }
  return user;
}

/**
 * サインイン済みならその利用者を、まだなら匿名アカウントを作って返す。
 * 初回はブラウザのタイムゾーンをプロフィールに入れる。
 *
 * 本登録していたブラウザでセッションが切れていた場合も匿名で始めるが、そのことを案内する
 * （匿名のままサインインし直せば、その間の記録も本登録のアカウントに引き継がれる）。
 */
export function ensureSession(): Promise<SessionUser> {
  ensuring ??= (async () => {
    try {
      return remember(await api<SessionUser>("GET", "/me"));
    } catch (err) {
      if (!(err instanceof ApiClientError) || err.status !== 401) throw err;
    }
    const s = storage();
    if (s?.getItem(REGISTERED_KEY) === "1") {
      s.setItem(EXPIRED_KEY, "1");
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    await api("POST", "/auth/anonymous");
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return remember(await api<SessionUser>("PATCH", "/me", timeZone ? { timeZone } : {}));
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError || err instanceof NetworkError) return err.message;
  return "予期しないエラーが発生しました";
}
