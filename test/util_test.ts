import { genMessageId } from "../util.ts";

Deno.test(function testGenMessageId() {
  console.log(genMessageId());
});
