import "./env.js";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";

async function main() {
  const config = loadConfig();
  const runtime = await createRuntime(config);

  if (process.argv.includes("--seed-only")) {
    console.log("Seed completed.");
    return;
  }

  serve({
    fetch: runtime.app.fetch,
    port: config.port,
  });

  console.log(`RetainDB marketing orchestrator running on http://localhost:${config.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
