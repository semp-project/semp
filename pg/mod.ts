import { hex, pg } from "../deps.ts";
import type {
  CreateUserInput,
  DataProvider,
  GetMessageInput,
  Message,
  MessageInput,
  UpdateUserInput,
  UserInfo,
} from "../provider.ts";
import { Migrations } from "./migration.ts";

export type MigrationFn = (db: pg.PoolClient) => Promise<unknown>;

export class PostgresDataProvider implements DataProvider {
  #db: pg.Pool;

  constructor(url: string) {
    const u = new URL(url);
    const poolSize = parseInt(u.searchParams.get("pool") || "5");
    this.#db = new pg.Pool(url, poolSize, true);
  }

  async init() {
    const c = await this.#db.connect();
    await this.migration(c, Migrations);
    c.release();
  }

  async close() {
    await this.#db.end();
  }

  async migration(db: pg.PoolClient, list: MigrationFn[]) {
    await db.queryArray(
      `CREATE TABLE IF NOT EXISTS migrations (ver INT PRIMARY KEY, created_at TIMESTAMP DEFAULT current_timestamp)`,
    );
    const res = await db.queryArray`SELECT count(*) FROM migrations`;

    let base = 0;
    if (res.rows.length !== 0) {
      base = parseInt(res.rows[0][0] as string);
    }

    if (base === list.length) return;

    let i = 0;
    for (const fn of list.slice(base)) {
      console.log(`current version: ${base + i}`);
      try {
        await fn(db);

        await db.queryArray`INSERT INTO migrations(ver) VALUES (${base + i++})`;
      } catch (err) {
        console.error(err);
        throw err;
      }
    }

    console.log("Migrated");
  }

  async storeMessage(data: MessageInput) {
    const db = await this.#db.connect();

    const content = hex.decode(data.content);
    await db.queryArray`INSERT INTO messages(
id,"timestamp","from","to",content) VALUES (${data.id},${data.timestamp},
${data.from},${data.to},${content})`;

    db.release();
  }

  /** Create user */
  async createUser(input: CreateUserInput) {
    const db = await this.#db.connect();

    const pubkey = hex.decode(input.public_key);
    await db
      .queryArray`INSERT INTO users (name,public_key,display_name,ban_hosts,ban_users)
VALUES (${input.name},${pubkey},${input.display_name},'{}','{}') ON CONFLICT DO NOTHING`;

    db.release();
  }

  /** Get all server banned hostnames */
  async getBanHosts() {
    const db = await this.#db.connect();

    const res = await db.queryArray`SELECT host FROM ban_hosts`;

    return res.rows.flat() as string[];
  }

  /** Update global banned hosts*/
  async setBanHosts(hosts: string[]) {
    const db = await this.#db.connect();

    const tx = db.createTransaction(crypto.randomUUID());
    await tx.begin();

    await tx.queryArray`TRUNCATE ban_hosts`;

    const sql = "INSERT INTO ban_hosts VALUES " +
      new Array(hosts.length).fill("").map((_, i) => `(\$${i + 1})`).join(",");

    await tx.queryArray(sql, hosts);
    await tx.commit();

    db.release();
  }

  /** Update user info */
  async updateUser(name: string, data: UpdateUserInput) {
    const db = await this.#db.connect();

    const tx = db.createTransaction(`update_${name}`);
    await tx.begin();

    try {
      const res = await tx
        .queryArray`SELECT untrusted_at FROM users WHERE name=${name}`;

      if (!res.rows.length) {
        throw new Error("User not found");
      }

      if (!res.rows[0][0] && data.untrusted_at === null) {
        throw new Error("User is untrusted, cannot modified to trusted");
      }

      await tx.queryArray`UPDATE users SET display_name=${data.display_name},
ban_hosts=${data.ban_hosts},
ban_users=${data.ban_users},
untrusted_at${data.untrusted_at ? new Date(data.untrusted_at) : null} 
WHERE name=${name}`;

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      db.release();
    }
  }

  /** Get user messages */
  async getMessages(input: GetMessageInput) {
    const db = await this.#db.connect();

    const res = await db.queryObject`SELECT id,"from","to","timestamp",content 
FROM messages WHERE "to"=${input.name} AND id>${input.since || ""}
ORDER BY timestamp LIMIT ${input.limit}`;

    db.release();
    return res.rows as Message[];
  }

  /** Delete user messages by id list */
  async deleteMessages(user: string, list: string[]) {
    const db = await this.#db.connect();

    await db
      .queryArray`DELETE FROM messages WHERE id IN ${list} AND to=${user}`;

    db.release();
  }

  /** Delete expired messages, defaults 7 days */
  async deleteExpiredMessages(e = 604800) {
    const db = await this.#db.connect();

    const prefix = hex.decode((~~(Date.now() / e)).toString(16));
    const bin = new Uint8Array([...prefix, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const id = hex.encode(bin);
    await db.queryArray`DELETE FROM messages WHERE id<${id}`;

    db.release();
  }

  /** Get user information */
  async getUser(name: string) {
    const db = await this.#db.connect();

    const res = await db
      .queryObject`SELECT name,public_key,display_name,ban_hosts,ban_users,untrusted_at 
FROM users WHERE name=${name} LIMIT 1`;

    if (!res.rows.length) throw new Error(`User '${name}' not found`);

    db.release();
    return res.rows[0] as UserInfo;
  }
}
