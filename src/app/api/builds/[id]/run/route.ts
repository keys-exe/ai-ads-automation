import { NextResponse } from "next/server";
import { one, query } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { enqueue, QUEUE_BY_STEP } from "@/worker/queue";
import { scriptAbsorptionLabel } from "@/processes/absorb-script";

/**
 * Start a step.
 *
 * §18 is explicit that steps 1-5 ship as one delivery and nothing inside waits
 * — "the only gate in the build is step 6." So no step gates another here.
 * What a step does require is its own inputs, and those are checked before a
 * job is queued rather than three minutes later in the worker.
 *
 * Steps 3, 4 and 5 chain: starting 3 runs 4 and 5 on completion without
 * another click. Step 3 is the first step that spends credits, which is why it
 * is the one a person starts rather than being triggered off step 2.
 */
const STEPS = {
  1: { kind: "absorb_inspo", label: () => "ABSORB INSPO VIDEO" },
  2: { kind: "absorb_script", label: (p: boolean) => scriptAbsorptionLabel(p) },
  3: { kind: "cast", label: () => "CAST — GENERATE REFERENCE SHEETS" },
  4: { kind: "locations", label: () => "PROPERTY AND LOCATION MAPS" },
  5: { kind: "maps", label: () => "ACT MAP AND WARDROBE MAP" },
} as const;

type Step = keyof typeof STEPS;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buildId = Number((await context.params).id);
  const body = (await request.json()) as { step?: number };
  const step = body.step as Step | undefined;

  if (!step || !(step in STEPS)) {
    return NextResponse.json({ error: "step must be 1-5" }, { status: 400 });
  }

  const missing = await missingInputs(buildId, step);
  if (missing.length) {
    return NextResponse.json({ error: `Not ready: ${missing.join("; ")}` }, { status: 400 });
  }

  // One live run per step. A second click while a run is in flight returns the
  // run already going rather than queueing a duplicate — which on steps 3 and
  // 4 would mean paying for every generation twice.
  const running = await one<{ id: number }>(
    `SELECT id FROM processes WHERE build_id = $1 AND step = $2 AND status IN ('queued','running')`,
    [buildId, step],
  );
  if (running) return NextResponse.json({ processId: running.id, alreadyRunning: true });

  const assets = await query<{ kind: string }>(`SELECT kind FROM assets WHERE build_id = $1`, [buildId]);
  const hasPlacement = assets.some((a) => a.kind === "product_placement");

  const spec = STEPS[step];
  const label = spec.label(hasPlacement);

  const proc = await one<{ id: number }>(
    `INSERT INTO processes (build_id, step, kind, prompt_label, status, stage)
     VALUES ($1, $2, $3, $4, 'queued', 'queued') RETURNING id`,
    [buildId, step, spec.kind, label],
  );

  const jobId = await enqueue(QUEUE_BY_STEP[step], { processId: proc!.id, buildId });
  await query(`UPDATE processes SET queue_job_id = $2 WHERE id = $1`, [proc!.id, jobId]);

  return NextResponse.json({ processId: proc!.id, label });
}

/** What this step needs that the build does not yet have. */
async function missingInputs(buildId: number, step: Step): Promise<string[]> {
  const assets = await query<{ kind: string }>(`SELECT kind FROM assets WHERE build_id = $1`, [buildId]);
  const have = new Set(assets.map((a) => a.kind));

  if (step === 1) return have.has("inspo_video") ? [] : ["no inspo video in the bundle"];

  if (step === 2) {
    return [
      have.has("script") ? null : "no script in the bundle",
      have.has("product") ? null : "no product reference in the bundle",
    ].filter((x): x is string => Boolean(x));
  }

  // Steps 3-5 all read the step-2 phrase inventory; casting, location
  // derivation and the story-day pass are all passes over it.
  const phrases = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM phrases WHERE build_id = $1`, [buildId],
  );
  if (Number(phrases?.count ?? 0) === 0) {
    return ["no phrase inventory — run step 2 first"];
  }

  if (step === 4) {
    const cast = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM characters WHERE build_id = $1`, [buildId],
    );
    if (Number(cast?.count ?? 0) === 0) return ["no cast — run step 3 first"];
  }

  if (step === 5) {
    const locations = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM locations WHERE build_id = $1`, [buildId],
    );
    if (Number(locations?.count ?? 0) === 0) return ["no locations — run step 4 first"];
  }

  return [];
}
