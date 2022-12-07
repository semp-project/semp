import { hex } from "../deps.ts";
import { PostgresDataProvider } from "../pg/mod.ts";
import { genMessageId } from "../util.ts";

Deno.test(async function testPgProvider() {
  const dburl = Deno.env.get("DB_URL")!;

  const db = new PostgresDataProvider(dburl);
  await db.init();

  const demo = hex.encode(crypto.getRandomValues(new Uint8Array(32)));
  await db.createUser({ name: "test", public_key: demo, display_name: "test" });
  await db.updateUser("test", {
    display_name: "hello",
    ban_hosts: ["111"],
    ban_users: ["222"],
    public_key: demo,
  });
  console.log(await db.getUser("test"));

  await db.storeMessage({
    id: genMessageId(),
    from: "@xxx.example.com",
    to: "@test.example.com",
    timestamp: new Date(),
    content: demo,
  });

  console.log(await db.getMessages({ name: "@test.example.com" }));

  await db.setBanHosts(["example.com", "semp.example"]);
  console.log(await db.getBanHosts());

  await db.close();
});
