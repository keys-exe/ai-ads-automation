#!/usr/bin/env tsx
/** Applies schema.sql. Idempotent apart from the enum types, which are guarded. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const sql = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// CREATE TYPE has no IF NOT EXISTS; run each statement and tolerate only the
// duplicate-object error so a re-run is safe but a real failure still surfaces.
for (const statement of sql.split(/;\s*\n(?=CREATE|ALTER|DROP)/)) {
  const trimmed = statement.trim();
  if (!trimmed) continue;
  try {
    await client.query(trimmed);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42710" || code === "42P07") continue; // duplicate_object / duplicate_table
    console.error(`\nFailed on:\n${trimmed.slice(0, 200)}\n`);
    throw error;
  }
}

console.log("migrations applied");
await client.end();
