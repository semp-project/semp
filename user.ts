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

  // TODO: Control rate limit

  const pkey = hex.decode(input.public_key);
  const hostKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(app.hostname),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    hostKey,
    pkey,
  );
  const name = hex.encode(new Uint8Array(buffer).slice(0, 4));

  await app.database.createUser({ ...input, name });

  return { name };
}

export async function getUser(req: Request, app: Application) {
  return await app.database.getUser(new URL(req.url).pathname.slice(1));
}

export async function updateUser(req: Request, app: Application) {
  await app.localAuthorize(req);
  const input = await streamBodyHash<UpdateUserInput>(req);

  validate(input, {
    type: "object",
    required: ["display_name", "ban_hosts", "ban_users", "untrusted_at"],
    properties: {
      display_name: { type: "string" },
      ban_hosts: { type: "array", items: { type: "string" } },
      ban_users: { type: "array", items: { type: "string" } },
      untrusted_at: { type: "string", nullable: true },
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
    type: "object",
    properties: {
      to: { type: "string" },
      from: { type: "string" },
      timestamp: { type: "string" },
      content: { type: "string", pattern: "[a-f0-9]{32,}" },
      sign: { type: "string", pattern: "[a-f0-9]{32,}" },
      nonce: { type: "string" },
    },
  });

  try {
    const from = resolveName(input.from);
    const to = resolveName(input.to);

    if (from.host === to.host && to.host === app.hostname) {
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
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      since: { type: "string" },
    },
  });

  if (!input.limit) input.limit = 20;
  return await app.database.getMessages({
    ...input,
    name: `@${name}.${app.hostname}`,
  });
}

export async function deleteMessages(req: Request, app: Application) {
  await app.localAuthorize(req);
  const input = await streamBodyHash<string[]>(req);
  const name = new URL(req.url).pathname.slice(1);

  validate(input, { type: "array", items: { type: "string" } });

  await app.database.deleteMessages(`@${name}.${app.hostname}`, input);

  return new Response(null, { status: 204 });
}
