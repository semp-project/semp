import { hex, http } from "./deps.ts";
import { handle } from "./server.ts";
import { Application } from "./application.ts";

function parseConfig() {
  const env = Deno.env.toObject();
  if (!env.SERVER_KEY) throw new Error("REQUIRED Server key");
  if (env.SERVER_KEY.length !== 64) throw new Error("Invalid Server key");
  if (!env.ADMIN_PUBLIC_KEY) throw new Error("REQUIRED Admin public key");
  if (env.ADMIN_PUBLIC_KEY.length !== 64) {
    throw new Error("Invalid Admin public key");
  }
  if (!env.HOSTNAME) throw new Error("REQUIRED Hostname");
  if (!env.ADMIN_NAME) throw new Error("REQUIRED Admin name");

  const dbUrl = env.DB_URL || "postgresql://semp@localhost:5432/semp";
  const bodyLimit = parseInt(env.LIMIT_SIZE || "2097152");
  const port = parseInt(env.PORT || "9000");
  const serverKey = hex.decode(env.SERVER_KEY);
  const adminPublicKey = hex.decode(env.ADMIN_PUBLIC_KEY);

  return {
    port,
    dbUrl,
    bodyLimit,
    serverKey,
    adminPublicKey,
    hostname: env.HOSTNAME,
    adminName: env.ADMIN_NAME,
    userRateLimit: env.USER_RATE_LIMIT || "100/30",
  };
}

async function start() {
  const conf = parseConfig();
  const app = new Application(conf);
  await app.database.init();
  http.serve(handle(app), { port: conf.port });
}

start();
