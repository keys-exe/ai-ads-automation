import { NextResponse } from "next/server";
import { one, query } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { storeUpload } from "@/lib/storage";

const KINDS = ["inspo_video", "script", "product", "product_sheet", "product_placement"] as const;
type Kind = (typeof KINDS)[number];

/** Kinds that hold exactly one asset; a re-upload replaces rather than adds. */
const SINGLE: Kind[] = ["inspo_video", "script", "product_sheet"];

/** Text kinds are decoded once at upload so a process never re-parses the file. */
const TEXT_KINDS: Kind[] = ["script", "product_sheet"];

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 512 * 1024 * 1024);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buildId = Number((await context.params).id);
  if (!Number.isInteger(buildId)) return NextResponse.json({ error: "Bad build id" }, { status: 400 });

  const build = await one(`SELECT id FROM builds WHERE id = $1`, [buildId]);
  if (!build) return NextResponse.json({ error: "No such build" }, { status: 404 });

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "") as Kind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  }

  // The inspo video may arrive as a link instead of a file.
  const sourceUrl = String(form.get("source_url") ?? "").trim();
  const file = form.get("file");

  if (!file && sourceUrl) {
    if (kind !== "inspo_video") {
      return NextResponse.json({ error: "Only the inspo video may be supplied as a URL" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ error: "source_url must be http(s)" }, { status: 400 });
    }
    await query(`DELETE FROM assets WHERE build_id = $1 AND kind = $2`, [buildId, kind]);
    const row = await one<{ id: number }>(
      `INSERT INTO assets (build_id, kind, filename, mime_type, byte_size, storage_path, source_url)
       VALUES ($1, $2, $3, 'text/uri-list', 0, '', $4) RETURNING id`,
      [buildId, kind, sourceUrl.slice(0, 180), sourceUrl],
    );
    return NextResponse.json({ id: row!.id, kind, pendingFetch: true });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file supplied" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is ${file.size} bytes; the limit is ${MAX_BYTES}` },
      { status: 413 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const stored = await storeUpload(buildId, kind, file.name, data, file.type || undefined);

  if (SINGLE.includes(kind)) {
    await query(`DELETE FROM assets WHERE build_id = $1 AND kind = $2`, [buildId, kind]);
  }

  const textContent = TEXT_KINDS.includes(kind) ? data.toString("utf8") : null;

  const row = await one<{ id: number }>(
    `INSERT INTO assets (build_id, kind, filename, mime_type, byte_size, storage_path, text_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [buildId, kind, file.name, file.type || "application/octet-stream", stored.byteSize, stored.storagePath, textContent],
  );

  return NextResponse.json({ id: row!.id, kind, byteSize: stored.byteSize });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buildId = Number((await context.params).id);
  const assetId = Number(new URL(request.url).searchParams.get("asset"));
  if (!Number.isInteger(assetId)) return NextResponse.json({ error: "Bad asset id" }, { status: 400 });

  await query(`DELETE FROM assets WHERE id = $1 AND build_id = $2`, [assetId, buildId]);
  return NextResponse.json({ ok: true });
}
