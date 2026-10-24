/**
 * node:sqlite を D1 の形に包む。マイグレーションを流した空のDBを返す。
 * D1 も中身は SQLite なので、SQL とスキーマ制約（CHECK・外部キー）はそのまま検証できる。
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { D1Database, D1PreparedStatement, D1Result } from "../../src/lib/db/d1.ts";

const MIGRATIONS = join(import.meta.dirname, "../../migrations");

export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  // D1 は外部キー制約が既定で有効
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }

  const statement = (sql: string, params: unknown[] = []): D1PreparedStatement => {
    const args = () => params.map((v) => (v === undefined ? null : v)) as never[];
    return {
      bind: (...values) => statement(sql, values),
      async first<T>() {
        return (db.prepare(sql).get(...args()) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...args()) as T[], meta: { changes: 0 } };
      },
      async run() {
        const r = db.prepare(sql).run(...args());
        return { results: [], meta: { changes: Number(r.changes) } } as D1Result;
      },
    };
  };

  return {
    prepare: (sql) => statement(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out: D1Result[] = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
