import { ed25519, hex } from "../deps.ts";

const key = crypto.getRandomValues(new Uint8Array(32));
const pub = await ed25519.getPublicKey(key);

const body = JSON.stringify({
  display_name: "xxx",
  public_key: hex.encode(pub),
});
const now = new Date();
const nonce = crypto.randomUUID();
const buf = new TextEncoder().encode(body);
const hashBuf = await crypto.subtle.digest("SHA-256", buf);
const hash = hex.encode(new Uint8Array(hashBuf));
const strToSign = ["PUT", now.toISOString(), hash, nonce].join(":");
const sign = await ed25519.sign(new TextEncoder().encode(strToSign), key);

const res = await fetch("http://localhost:8000/~", {
  method: "PUT",
  body,
  headers: {
    "content-type": "application/json",
    "content-hash": hash,
    "x-semp-nonce": nonce,
    authorization: hex.encode(sign),
    date: now.toISOString(),
  },
});

console.log(res.status);

console.log(await res.json());
