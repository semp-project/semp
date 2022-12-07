import { hex, HttpError, jsonschema } from "./deps.ts";

export function validate(instance: unknown, schema: unknown) {
  try {
    jsonschema.validate(instance, schema, { throwError: true });
  } catch (err) {
    throw new HttpError("Invalid format", err.message, 400);
  }
}

export async function streamBodyHash<T>(req: Request) {
  const raw = await req.text();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );

  if (req.headers.get("content-hash") !== hex.encode(new Uint8Array(hash))) {
    throw new HttpError("Invalid request", "Invalid hash", 400);
  }

  return JSON.parse(raw) as T;
}

export function genMessageId() {
  const ts = hex.decode((~~(Date.now() / 1000)).toString(16));
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return hex.encode(new Uint8Array([...ts, ...rnd]));
}

/**
Check if semp schema

eg.
"@alice.example.com"
*/
export function resolveName(str: string) {
  if (!str.startsWith("@")) {
    throw new Error("Invalid schema format");
  }

  const arr = str.slice(1).split(".");
  if (arr.length < 2) throw new Error("Invalid name or host");

  if (!arr[0].match(/^[a-z0-9][a-z0-9_]*$/i)) {
    throw new Error("Invalid user name");
  }

  const host = arr.slice(1).join(".");
  if (
    !host.match(
      /^(?=.{1,255}$)[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|-){0,61}[0-9A-Za-z])?)*\.?$/,
    )
  ) {
    throw new Error("Invalid host name");
  }

  return { name: arr[0], host };
}
