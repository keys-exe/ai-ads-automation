import { NextResponse } from "next/server";
import { one } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { loadStandards } from "@/standards/registry";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A build needs a name" }, { status: 400 });

  // §E3 version_built_against: the build is pinned to the standards it was
  // built under, so a later version never silently reinterprets it.
  const build = await one<{ id: number }>(
    `INSERT INTO builds (name, created_by, standards_version) VALUES ($1, $2, $3) RETURNING id`,
    [name, user.id, loadStandards().version],
  );

  return NextResponse.json({ id: build!.id });
}
