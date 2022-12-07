import { DataProvider, ExchangeBody, getProvider } from "./provider.ts";
import { resolveName, validate } from "./util.ts";
import { ed25519, hex } from "./deps.ts";

type AppConfig = {
  hostname: string;
  serverKey: Uint8Array;
  adminName: string;
  adminPublicKey: Uint8Array;
  bodyLimit: number;
  userRateLimit: string;
  dbUrl: string;
};

export class Application {
  hostname: string;
  adminPublicKey: Uint8Array;
  serverKey: Uint8Array;
  adminName: string;
  database: DataProvider;
  bodyLimit: number;
  serverKeyMap: Map<string, Uint8Array> = new Map();

  constructor(conf: AppConfig) {
    this.hostname = conf.hostname;
    this.adminPublicKey = conf.adminPublicKey;
    this.serverKey = conf.serverKey;
    this.adminName = conf.adminName;
    this.database = getProvider(conf.dbUrl);
    this.bodyLimit = conf.bodyLimit;
  }

  async getRemotePublicKey(host: string) {
    const res = await fetch(`https://${host}/~`);
    if (res.status !== 200) throw new Error("This server do not support SEMP");

    const json = await res.json();
    validate(json, {
      type: "object",
      properties: {
        server_public_key: { type: "string", pattern: "[a-z0-9]{64}" },
        ban_hosts: { type: "array", items: { type: "string" } },
      },
    });

    const ban_hosts = json.ban_hosts as string[];
    if (ban_hosts.includes(this.hostname)) {
      throw new Error("Remote server has baned our server");
    }

    return hex.decode(json.server_public_key);
  }

  async getRemoteUserKey(user: string, local: string) {
    const obj = resolveName(user);
    const res = await fetch(`https://${obj.host}/${obj.name}`);
    if (res.status !== 200) throw new Error("This server do not support SEMP");

    const json = await res.json();
    validate(json, {
      type: "object",
      properties: {
        public_key: { type: "string", pattern: "[a-z0-9]{64}" },
        ban_hosts: { type: "array", items: { type: "string" } },
        ban_users: { type: "array", items: { type: "string" } },
      },
    });

    const ban_hosts = json.ban_hosts as string[];
    if (ban_hosts.includes(this.hostname)) {
      throw new Error("Remote server has baned our server");
    }

    const ban_users = json.ban_users as string[];
    if (ban_users.includes(local)) {
      throw new Error("Remote user has baned your account");
    }

    return hex.decode(json.public_key);
  }

  /** Use to validate client by server requests */
  async localAuthorize(req: Request, public_key?: Uint8Array) {
    if (!req.headers.has("authorization")) throw new Error("Forbidden");
    if (!req.headers.has("date")) throw new Error("Forbidden");
    if (!req.headers.has("content-hash")) throw new Error("Forbidden");
    if (!req.headers.has("x-semp-nonce")) throw new Error("Forbidden");

    const sign = hex.decode(req.headers.get("authorization")!);
    const name = new URL(req.url).pathname.slice(1);
    const date = new Date(req.headers.get("date")!);
    if (Date.now() - date.getTime() > 10000) {
      throw new Error("Signature expired");
    }

    const strToSign = [
      req.method,
      date.toISOString(),
      req.headers.get("content-hash"),
      req.headers.get("x-semp-nonce"),
    ].join(":");

    const key = public_key ?? (await this.database.getUser(name)).public_key;

    const buf = new TextEncoder().encode(strToSign);
    if (!await ed25519.verify(sign, buf, key)) {
      throw new Error("Unverified signature");
    }
  }

  /** Use to validate server by server exchange request */
  async remoteAuthorize(req: Request) {
    if (!req.headers.has("authorization")) throw new Error("Forbidden");
    if (!req.headers.has("date")) throw new Error("Forbidden");
    if (!req.headers.has("origin")) throw new Error("Forbidden");
    if (!req.headers.has("x-semp-nonce")) throw new Error("Forbidden");
    if (!req.headers.has("content-hash")) throw new Error("Forbidden");

    const sign = hex.decode(req.headers.get("authorization")!);
    const origin = new URL(req.headers.get("origin")!).hostname;
    const date = new Date(req.headers.get("date")!);
    if (Date.now() - date.getTime() > 10000) {
      throw new Error("Signature expired");
    }

    const strToSign = [
      origin,
      this.hostname,
      date.toISOString(),
      req.headers.get("content-hash"),
      req.headers.get("x-semp-nonce"),
    ].join(":");

    const key = await this.getRemotePublicKey(origin);

    const buf = new TextEncoder().encode(strToSign);
    if (!await ed25519.verify(sign, buf, key)) {
      throw new Error("Unverified signature");
    }
  }

  async sendExchange(params: ExchangeBody) {
    const nonce = crypto.randomUUID();
    const remote = resolveName(params.to);
    const content = new TextEncoder().encode(JSON.stringify(params));
    const hash = await crypto.subtle.digest("SHA-256", content);
    const hashStr = hex.encode(new Uint8Array(hash));
    const strToSign = [
      this.hostname,
      remote.host,
      params.timestamp,
      hashStr,
      nonce,
    ].join(":");
    const sign = await ed25519.sign(
      new TextEncoder().encode(strToSign),
      this.serverKey,
    );

    const res = await fetch(`https://${remote.host}/~`, {
      method: "POST",
      body: content,
      headers: {
        "content-type": "application/json",
        "content-hash": hashStr,
        origin: `https://${this.hostname}`,
        "x-semp-nonce": nonce,
        authorization: hex.encode(sign),
      },
    });

    if (res.status !== 200) {
      // Exchange fail
      throw new Error("Exchange fail");
    }
  }
}
