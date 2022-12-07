import {
  CreateUserInput,
  ExchangeBody,
  GetMessageInput,
  UpdateUserInput,
} from "./provider.ts";
import { genMessageId, resolveName, streamBodyHash, validate } from "./util.ts";
import { hex, HttpError } from "./deps.ts";
import { Application } from "./application.ts";

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

export async function getUser(req: Request, app: Application) {
  return await app.database.getUser(new URL(req.url).pathname.slice(1));
}

export async function updateUser(req: Request, app: Application) {
  await app.localAuthorize(req);
  const input = await streamBodyHash<UpdateUserInput>(req);

  validate(input, {
    type: "object",
    required: ["name"],
    properties: {
      public_key: { type: "string", pattern: "[0-9a-f]{64}" },
      display_name: { type: "string" },
      ban_hosts: { type: "array", items: { type: "string" } },
      ban_users: { type: "array", items: { type: "string" } },
    },
  });

  const name = new URL(req.url).pathname.slice(1);
  await app.database.updateUser(name, input);

  return new Response(null, { status: 204 });
}
export async function send(req: Request, app: Application) {
  await app.localAuthorize(req);
  const input = await streamBodyHash<ExchangeBody>(req);

  validate(input, {
    to: { type: "string" },
    from: { type: "string" },
    timestamp: { type: "string" },
    content: { type: "string", pattern: "[a-f0-9]{32,}" },
    sign: { type: "string", pattern: "[a-f0-9]{32,}" },
    nonce: { type: "string" },
  });

  try {
    const from = resolveName(input.from);
    const to = resolveName(input.to);

    if (from.host === to.host) {
      await app.database.storeMessage({
        ...input,
        id: genMessageId(),
        timestamp: new Date(input.timestamp),
      });

      return new Response(null, { status: 201 });
    }
  } catch (err) {
    throw new HttpError("Invalid from user name", err.message);
  }

  await app.sendExchange(input);

  return new Response(null, { status: 201 });
}

export async function getMessage(req: Request, app: Application) {
  await app.localAuthorize(req);
  const input = await streamBodyHash<GetMessageInput>(req);
  const name = new URL(req.url).pathname.slice(1);

  validate(input, {
    limit: { type: "integer" },
    since: { type: "string" },
  });

  if (!input.limit) input.limit = 20;
  return await app.database.getMessages({
    ...input,
    name: `@${name}.${app.hostname}`,
  });
}
