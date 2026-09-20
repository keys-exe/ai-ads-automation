import { NextResponse } from "next/server";
import { query } from "@/db/client";
import { currentUser } from "@/lib/auth";

/** Polled by the build page while a step is in flight. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buildId = Number((await context.params).id);

  const processes = await query(
    `SELECT id, step, kind, prompt_label, status, stage, error, usage, started_at, finished_at
       FROM processes WHERE build_id = $1 ORDER BY id DESC`,
    [buildId],
  );

  const artifacts = await query(
    `SELECT id, kind, created_at FROM artifacts WHERE build_id = $1 ORDER BY id DESC`,
    [buildId],
  );

  return NextResponse.json({ processes, artifacts });
}
