export * as ed25519 from "https://esm.sh/@noble/ed25519@1.7.1";
export * as pg from "https://deno.land/x/postgres@v0.17.0/mod.ts";
export * as http from "https://deno.land/std@0.166.0/http/server.ts";
export * as jsonschema from "https://esm.sh/jsonschema@1.4.1";

import * as _hex from "https://deno.land/std@0.165.0/encoding/hex.ts";
export const hex = {
  encode: (input: Uint8Array) => new TextDecoder().decode(_hex.encode(input)),
  decode: (input: string) => _hex.decode(new TextEncoder().encode(input)),
};

export class HttpError extends Error {
  description = "";
  statusCode = 400;
  constructor(msg: string, desc = "", code = 400) {
    super(msg);
    this.description = desc;
    this.statusCode = code;
  }

  toResponse(h?: HeadersInit) {
    return new Response(
      JSON.stringify({ error: this.message, description: this.description }),
      {
        status: this.statusCode,
        headers: { ...h, "content-type": "application/json" },
      },
    );
  }
}
