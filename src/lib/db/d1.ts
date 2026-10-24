/**
 * Cloudflare D1 のうち、このアプリが使う部分だけの型。
 *
 * @cloudflare/workers-types を入れると Next.js 側の DOM 型と衝突するので、必要な形だけを書く。
 * テストでは node:sqlite をこの形に包んで使う（test/helpers/d1.ts）。
 */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
