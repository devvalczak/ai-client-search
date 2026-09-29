import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db };

function createDb(): Db {
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || "./data/app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export const db: Db = globalForDb.__db ?? (globalForDb.__db = createDb());
export { schema };
