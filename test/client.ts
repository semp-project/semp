import { ed25519, hex } from "../deps.ts";

// caf5d7a6dc1b5d520edcd0bbbdf80d0b1f82040d4eca4d1cd13c049bd95ab62e
// 916c3fc01e90ad56937b4330ee3f501c5e40ffc7d2834585fd3d77f2decd5d19

const priv = hex.decode(
  "caf5d7a6dc1b5d520edcd0bbbdf80d0b1f82040d4eca4d1cd13c049bd95ab62e",
);
const pub = hex.decode(
  "916c3fc01e90ad56937b4330ee3f501c5e40ffc7d2834585fd3d77f2decd5d19",
);

async function signForRequest(
  action: string,
  content: string,
  priv: Uint8Array,
) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  const now = new Date();
  const strToSign = [
    action,
    now.toISOString(),
    hex.encode(new Uint8Array(hash)),
  ].join("\n");
  const sign = await ed25519.sign(new TextEncoder().encode(strToSign), priv);
  return { sign: hex.encode(sign), date: now.toISOString() };
}

const data = JSON.stringify({
  name: "dogeep",
  public_key:
    "916c3fc01e90ad56937b4330ee3f501c5e40ffc7d2834585fd3d77f2decd5d19",
  display_name: "jjb",
  ban_hosts: [],
  ban_users: ["@xxx.example.com"],
});
const { sign, date } = await signForRequest(
  "PUT:localhost:/semp/user",
  data,
  priv,
);
const res = await fetch("http://localhost:9000/semp/user", {
  method: "PUT",
  headers: {
    "content-type": "application/json",
    date,
    authorization: "dogeep:" + sign,
  },
  body: data,
});
console.log(res.status);
console.log(await res.text());
