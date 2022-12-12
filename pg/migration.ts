import { MigrationFn } from "./mod.ts";

// ***********************
// WARNING: APPEND migrations into this list, DO NOT modify it
// ***********************
export const Migrations: MigrationFn[] = [
  /**
  2022-11-25 16:31

  Create user table
  */
  (db) =>
    db.queryArray`CREATE TABLE IF NOT EXISTS users (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
  public_key BYTEA NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  ban_hosts TEXT[],
  ban_users TEXT[]
)`,

  /**
  2022-11-27 20:50

  Create messsage table
  */
  (db) =>
    db.queryArray`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "timestamp" TIMESTAMP NOT NULL,
  content BYTEA NOT NULL
)`,

  /**
  2022-11-29 14:29

  Create ban hosts table
  */
  (db) =>
    db.queryArray`CREATE TABLE IF NOT EXISTS ban_hosts (host TEXT PRIMARY KEY)`,

  /**
  2022-12-12 10:30

  Add untrusted_at column for user table
  */
  (db) =>
    db.queryArray`ALTER TABLE users ADD COLUMN untrusted_at TIMESTAMP DEFAULT NULL`,
];
