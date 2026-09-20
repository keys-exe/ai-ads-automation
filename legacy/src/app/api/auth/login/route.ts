import { NextResponse } from "next/server";
import { one } from "@/db/client";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await one<{ id: number; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );

  // Same response whether the account is unknown or the password is wrong, so
  // the endpoint does not confirm which emails exist.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
