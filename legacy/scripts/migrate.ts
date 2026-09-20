#!/usr/bin/env tsx
/**
 * Applies every migration in src/db/migrations, in filename order.
 * Idempotent: CREATE TYPE has no IF NOT EXISTS, so duplicate-object errors are
 * tolerated while anything else still surfaces.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const dir = join(process.cwd(), "src/db/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  let applied = 0;
  for (const statement of sql.split(/;\s*\n(?=CREATE|ALTER|DROP)/)) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    try {
      await client.query(trimmed);
      applied += 1;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42710" || code === "42P07") continue; // duplicate_object / duplicate_table
      console.error(`\nFailed in ${file} on:\n${trimmed.slice(0, 200)}\n`);
      throw error;
    }
  }
  console.log(`  ${file}: ${applied} statements`);
}

console.log("migrations applied");
await client.end();
