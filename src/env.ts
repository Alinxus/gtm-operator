import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "marketing-orchestrator/.env")]) {
  if (!existsSync(candidate)) continue;
  parseEnvFile(readFileSync(candidate, "utf8"));
}
