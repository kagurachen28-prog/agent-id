import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DB_DIR = join(homedir(), ".agent-id");
const DB_PATH = join(DB_DIR, "cache.db");

// TTL constants in seconds
export const TTL = {
  USER_PROFILE: 60 * 60,        // 1 hour
  PR_REVIEW_DATA: 6 * 60 * 60,  // 6 hours
  PROFILE: 60 * 60,             // 1 hour
};

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_cache (
      url TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_cache (
      username TEXT PRIMARY KEY,
      profile TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    );
  `);

  return db;
}

// --- API cache ---

export function getCachedResponse(url: string, ttlSeconds: number): string | null {
  const row = getDb()
    .prepare("SELECT response, fetched_at FROM api_cache WHERE url = ?")
    .get(url) as { response: string; fetched_at: number } | undefined;

  if (!row) return null;

  const age = Math.floor(Date.now() / 1000) - row.fetched_at;
  if (age > ttlSeconds) return null;

  return row.response;
}

export function setCachedResponse(url: string, response: string): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO api_cache (url, response, fetched_at) VALUES (?, ?, ?)"
    )
    .run(url, response, Math.floor(Date.now() / 1000));
}

// --- Profile cache ---

export function getCachedProfile(username: string, ttlSeconds: number): string | null {
  const row = getDb()
    .prepare("SELECT profile, generated_at FROM profile_cache WHERE username = ?")
    .get(username) as { profile: string; generated_at: number } | undefined;

  if (!row) return null;

  const age = Math.floor(Date.now() / 1000) - row.generated_at;
  if (age > ttlSeconds) return null;

  return row.profile;
}

export function setCachedProfile(username: string, profile: string): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO profile_cache (username, profile, generated_at) VALUES (?, ?, ?)"
    )
    .run(username, profile, Math.floor(Date.now() / 1000));
}

// --- Cache control ---

/** Global flag: when true, skip all cache reads (writes still happen) */
export let cacheDisabled = false;

/** Custom TTL multiplier (default 1.0) */
export let ttlMultiplier = 1.0;

export function disableCache(): void {
  cacheDisabled = true;
}

export function setTtlMultiplier(m: number): void {
  ttlMultiplier = m;
}

export function closeCache(): void {
  if (db) {
    db.close();
    db = null;
  }
}
