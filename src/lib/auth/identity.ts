/**
 * ログイン方法（Apple / Google / メール / パスキー）に共通の、サインインとアカウントの結び付け。
 *
 *   その方法が誰にも使われていない
 *     - 今サインインしている利用者がいれば、その人のログイン方法として追加する（匿名なら本登録になる）
 *     - いなければ新しいアカウントを作る
 *   その方法が既に誰かのもの
 *     - 今の利用者が匿名なら、匿名の記録をそのアカウントに統合してからサインインする（記録を失わない）
 *     - 今の利用者が別の本登録アカウントなら、勝手に切り替えずに conflict を返す
 *
 * メールアドレスが同じでも、別の方法同士を自動では結び付けない（なりすましの経路になるため）。
 * 結び付けたいときは、サインインした状態でもう一方の方法を追加する。
 */
import type { Provider, Store, User } from "../db/store.ts";

export type SignInOutcome =
  | { status: "ok"; user: User; created: boolean; linked: boolean; mergedAnonymous: boolean }
  | { status: "conflict" };

export async function signInWithIdentity(
  store: Store,
  input: {
    provider: Provider;
    subject: string;
    email?: string | null;
    providerRefreshToken?: string | null;
    current: User | null;
  },
): Promise<SignInOutcome> {
  const { provider, subject, current } = input;
  const existing = await store.findIdentity(provider, subject);

  if (existing) {
    await store.updateIdentity(provider, subject, {
      email: input.email,
      providerRefreshToken: input.providerRefreshToken,
    });
    return resolveExistingOwner(store, existing.userId, current);
  }

  if (current) {
    await store.addIdentity(current.id, {
      provider,
      subject,
      email: input.email,
      providerRefreshToken: input.providerRefreshToken,
    });
    await store.markRegistered(current.id);
    const user = (await store.getUser(current.id))!;
    return { status: "ok", user, created: false, linked: true, mergedAnonymous: false };
  }

  const user = await store.createUser({ anonymous: false });
  await store.addIdentity(user.id, {
    provider,
    subject,
    email: input.email,
    providerRefreshToken: input.providerRefreshToken,
  });
  return { status: "ok", user, created: true, linked: false, mergedAnonymous: false };
}

/**
 * 既に持ち主のいるログイン方法（またはパスキー）でサインインしたときの扱い。
 * パスキーのサインインからも使う。
 */
export async function resolveExistingOwner(
  store: Store,
  ownerId: string,
  current: User | null,
): Promise<SignInOutcome> {
  const owner = await store.getUser(ownerId);
  if (!owner) throw new Error("ログイン方法の持ち主が見つかりません");

  if (!current || current.id === owner.id) {
    return { status: "ok", user: owner, created: false, linked: false, mergedAnonymous: false };
  }
  if (current.isAnonymous) {
    await store.mergeAnonymousUser(current.id, owner.id);
    return { status: "ok", user: owner, created: false, linked: false, mergedAnonymous: true };
  }
  return { status: "conflict" };
}
