/**
 * Am I ready, and what do I do next?
 *
 *   npx tsx scripts/ready.ts
 *
 * Exits non-zero when something required is missing, so a SessionStart hook can
 * use it as a gate as well as a report.
 */

import { checkReadiness } from "@/lib/readiness";
import { explain } from "./lib/console-reporter";

const MARK: Record<string, string> = { ok: "✓", missing: "✗", failing: "✗", optional: "·" };

async function main(): Promise<void> {
  const readiness = await checkReadiness();

  console.log();
  for (const check of readiness.checks) {
    console.log(`${MARK[check.status]} ${check.label.padEnd(22)} ${check.detail}`);
    if (check.fix) console.log(`    → ${check.fix}`);
    if (check.blocks.length) console.log(`    blocks: ${check.blocks.join("; ")}`);
  }

  console.log("\nCAN RUN");
  console.log(`  step 1 (absorb inspo video)   ${readiness.canRunStep1 ? "yes" : "no"}`);
  console.log(`  step 2 (absorb script)        ${readiness.canRunStep2 ? "yes" : "no"}`);
  console.log(`  steps 3-5 (cast → maps)       ${readiness.canRunSteps345 ? "yes" : "no"}`);

  if (readiness.nextAction) {
    console.log(`\nNEXT · ${readiness.nextAction.label}\n  ${readiness.nextAction.detail}\n`);
    process.exitCode = 1;
    return;
  }

  console.log("\nEverything required is in place.\n");
}

main().catch((error) => {
  console.error(`\n${explain(error)}\n`);
  process.exitCode = 1;
});
