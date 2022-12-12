import { ed25519, hex, HttpError } from "./deps.ts";
import { Application } from "./application.ts";
import { genMessageId, resolveName, streamBodyHash, validate } from "./util.ts";
import { CreateUserInput, ExchangeBody } from "./provider.ts";

export async function createUser(req: Request, app: Application) {
  const input = await streamBodyHash<CreateUserInput>(req);

  validate(input, {
    type: "object",
    required: ["display_name", "public_key"],
    properties: {
      public_key: { type: "string", pattern: "[0-9a-f]{64}" },
      display_name: { type: "string", minLength: 2 },
    },
  });

  // TODO: Contorl rate limit

  const pkey = hex.decode(input.public_key);
  const namebuf = new Uint8Array(await crypto.subtle.digest("SHA-256", pkey));
  input.name = hex.encode(namebuf.slice(0, 4));

  await app.database.createUser(input);

  return { name: input.name };
}

/** Get server status */
export async function status(_: Request, app: Application) {
  const server_public_key = await ed25519.getPublicKey(app.serverKey);
  return {
    /** SEMP version */
    semp: 1,
    ban_hosts: await app.database.getBanHosts(),
    timestamp: new Date().toISOString(),
    server_admin: `@${app.adminName}.${app.hostname}`,
    admin_public_key: app.adminPublicKey,
    server_public_key,

    openRegistration: true,
  };
}

/** Update server banned hosts */
export async function update(req: Request, app: Application) {
  await app.localAuthorize(req, app.adminPublicKey);
  const input = await streamBodyHash<string[]>(req);

  validate(input, { type: "array", items: { type: "string" } });

  await app.database.setBanHosts(input);

  return new Response(null, { status: 204 });
}

export async function exchange(req: Request, app: Application) {
  await app.remoteAuthorize(req);
  const input = await streamBodyHash<ExchangeBody>(req);

  validate(input, {
    type: "object",
    properties: {
      to: { type: "string" },
      from: { type: "string" },
      timestamp: { type: "string" },
      content: { type: "string", pattern: "[a-f0-9]{32,}" },
      sign: { type: "string", pattern: "[a-f0-9]{64}" },
      nonce: { type: "string" },
    },
  });

  try {
    resolveName(input.from);
    const to = resolveName(input.to);

    if (to.host !== app.hostname) {
      throw new Error("Not allowed accept other hosts messages");
    }
  } catch (err) {
    throw new HttpError("Invalid user name", err.message);
  }

  const publicKey = await app.getRemoteUserKey(input.from, input.to);
  await validateExchange({ ...input, publicKey });
  await app.database.storeMessage({
    ...input,
    id: genMessageId(),
    timestamp: new Date(input.timestamp),
  });

  return new Response(null, { status: 204 });
}

async function validateExchange(
  params: ExchangeBody & { publicKey: Uint8Array },
) {
  const buf = hex.decode(params.content);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const strToSign = [
    params.from,
    params.to,
    params.timestamp,
    hex.encode(new Uint8Array(hash)),
    params.nonce,
  ].join(":");
  const msg = new TextEncoder().encode(strToSign);
  const sign = hex.decode(params.sign);
  if (!await ed25519.verify(sign, msg, params.publicKey)) {
    throw new Error("Invalid signature");
  }
}
