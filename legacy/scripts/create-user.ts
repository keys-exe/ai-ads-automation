#!/usr/bin/env tsx
/** Adds a team member. Usage: npm run user -- email@example.com "Name" password */
import { hashPassword } from "../src/lib/auth";
import { query } from "../src/db/client";
import { pool } from "../src/db/client";

const [email, name, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: tsx scripts/create-user.ts <email> "<name>" <password>');
  process.exit(1);
}

await query(
  `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
  [email.toLowerCase(), name ?? "", await hashPassword(password)],
);

console.log(`user ready: ${email}`);
await pool.end();
