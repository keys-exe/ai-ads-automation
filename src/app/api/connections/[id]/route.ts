import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { one } from "@/db/client";
import { activateConnection, deleteConnection, resolveConnection, type Provider } from "@/lib/connections";
import { testConnection, recordTest } from "@/lib/connection-test";

/** POST /api/connections/:id — { action: "test" | "activate" } */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = Number((await context.params).id);
  const { action } = (await request.json()) as { action?: string };

  const row = await one<{ provider: Provider; is_active: boolean }>(
    `SELECT provider, is_active FROM connections WHERE id = $1`, [id],
  );
  if (!row) return NextResponse.json({ error: "No such connection" }, { status: 404 });

  if (action === "activate") {
    await activateConnection(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "test") {
    // Only the active connection is resolvable, since that is the one the
    // pipeline would actually use. Testing an inactive row would report on a
    // credential no build can reach.
    if (!row.is_active) {
      return NextResponse.json(
        { error: "Activate this connection before testing it — only the active one is used." },
        { status: 400 },
      );
    }
    const resolved = await resolveConnection(row.provider);
    if (!resolved) return NextResponse.json({ error: "Connection could not be resolved" }, { status: 400 });

    const result = await testConnection(resolved);
    await recordTest(id, result);
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: 'action must be "test" or "activate"' }, { status: 400 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await deleteConnection(Number((await context.params).id));
  return NextResponse.json({ ok: true });
}
