import { NextResponse } from "next/server";
import { one, query } from "@/db/client";
import { currentUser } from "@/lib/auth";
import { enqueue, QUEUE_ABSORB_INSPO, QUEUE_ABSORB_SCRIPT } from "@/worker/queue";
import { scriptAbsorptionLabel } from "@/processes/absorb-script";

/**
 * Start one of the two step processes.
 *
 * §18 is explicit that steps 1-5 ship as one delivery and nothing inside waits
 * — "the only gate in the build is step 6". So step 2 does NOT require step 1
 * to have finished; the two are independently startable and the UI runs them
 * back to back. What step 2 requires is its own inputs.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buildId = Number((await context.params).id);
  const body = (await request.json()) as { step?: number };
  const step = body.step;

  if (step !== 1 && step !== 2) {
    return NextResponse.json({ error: "step must be 1 or 2" }, { status: 400 });
  }

  const assets = await query<{ kind: string }>(
    `SELECT kind FROM assets WHERE build_id = $1`,
    [buildId],
  );
  const have = new Set(assets.map((a) => a.kind));

  // Refuse to start a step whose inputs are not in the bundle, rather than
  // letting the worker fail three minutes later.
  const missing =
    step === 1
      ? have.has("inspo_video") ? [] : ["inspo video"]
      : [
          have.has("script") ? null : "script",
          have.has("product") ? null : "product reference",
        ].filter(Boolean);

  if (missing.length) {
    return NextResponse.json(
      { error: `Missing from the bundle: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // One live run per step. A second click while a run is in flight is a no-op
  // that returns the run already going, not a duplicate job.
  const running = await one<{ id: number }>(
    `SELECT id FROM processes WHERE build_id = $1 AND step = $2 AND status IN ('queued','running')`,
    [buildId, step],
  );
  if (running) return NextResponse.json({ processId: running.id, alreadyRunning: true });

  const hasPlacement = have.has("product_placement");
  const label = step === 1 ? "ABSORB INSPO VIDEO" : scriptAbsorptionLabel(hasPlacement);
  const kind = step === 1 ? "absorb_inspo" : "absorb_script";

  const proc = await one<{ id: number }>(
    `INSERT INTO processes (build_id, step, kind, prompt_label, status, stage)
     VALUES ($1, $2, $3, $4, 'queued', 'queued') RETURNING id`,
    [buildId, step, kind, label],
  );

  const jobId = await enqueue(step === 1 ? QUEUE_ABSORB_INSPO : QUEUE_ABSORB_SCRIPT, {
    processId: proc!.id,
    buildId,
  });

  await query(`UPDATE processes SET queue_job_id = $2 WHERE id = $1`, [proc!.id, jobId]);

  return NextResponse.json({ processId: proc!.id, label });
}
