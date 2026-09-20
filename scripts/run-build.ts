/**
 * Run a build.
 *
 *   npx tsx scripts/run-build.ts <slug> [options]
 *
 * One drop folder in, §18 steps 1 through 5 out. The bundle is classified, the
 * build is created, and the chain runs without stopping — §18: "Steps 1-5 ship
 * as one opening delivery. Nothing inside it waits."
 *
 * Options:
 *   --name "..."    a human name for the build (defaults to the slug)
 *   --from <1-5>    start at this step instead of step 1
 *   --only <1-5>    run exactly this step and do not carry on
 *   --no-generate   assemble and log every generation call, submit none
 *   --force         run even though the inbox holds files that could not be placed
 */

import { loadStandards } from "@/standards/registry";
import { classifyInbox } from "@/intake/classify";
import { createBuild, saveBundle, paths } from "@/store";
import { setReporter } from "@/lib/report";
import { setGenerationClientFactory } from "@/generation/client";
import { DryRunGenerationClient } from "@/generation/dry-run";
import { runAbsorbInspo, runAbsorbScript } from "@/processes/runner";
import { runCast, runLocations, runMaps } from "@/processes/chain";
import { consoleReporter, explain } from "./lib/console-reporter";

interface Options {
  slug: string;
  name: string;
  from: number;
  only: number | null;
  generate: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const [slug, ...rest] = argv;
  if (!slug || slug.startsWith("-")) {
    throw new Error("Usage: npm run build:run -- <slug> [--name \"...\"] [--from 1-5] [--only 1-5] [--no-generate] [--force]");
  }

  const options: Options = { slug, name: slug, from: 1, only: null, generate: true, force: false };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--name") options.name = rest[++i] ?? slug;
    else if (arg === "--from") options.from = requireStep(rest[++i], "--from");
    else if (arg === "--only") options.only = requireStep(rest[++i], "--only");
    else if (arg === "--no-generate") options.generate = false;
    else if (arg === "--force") options.force = true;
    else throw new Error(`Unknown option "${arg}".`);
  }

  return options;
}

function requireStep(value: string | undefined, flag: string): number {
  const step = Number(value);
  if (!Number.isInteger(step) || step < 1 || step > 5) {
    throw new Error(`${flag} takes a step number from 1 to 5. Steps 6-8 are not built yet.`);
  }
  return step;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const standards = await loadStandards();

  // --- Intake
  const bundle = await classifyInbox(options.slug);

  if (!bundle.assets.length) {
    throw new Error(
      `Nothing to absorb. Put the inspo video, the script, the product images and the Product Sheet in ${paths(options.slug).inbox} and run this again.`,
    );
  }

  console.log(`\nBUNDLE · ${options.slug}`);
  for (const kind of ["inspo_video", "script", "product_sheet", "product", "product_placement"] as const) {
    const matches = bundle.assets.filter((asset) => asset.kind === kind);
    if (!matches.length) continue;
    console.log(`  ${kind.padEnd(18)} ${matches.map((m) => m.filename).join(", ")}`);
  }
  if (bundle.productSheetPy) console.log(`  product_sheet .py  ${bundle.productSheetPy}`);

  // §18 step 2's verification depends on the bundle being what it claims, so a
  // file this could not place stops the run rather than being dropped quietly.
  if (bundle.unclassified.length) {
    console.log("\nCOULD NOT PLACE");
    for (const entry of bundle.unclassified) {
      console.log(`  ${entry.filename}\n    ${entry.reason}`);
    }
    if (!options.force) {
      console.log("\nRename these, list them in bundle.json, or re-run with --force to ignore them.");
      process.exitCode = 1;
      return;
    }
    console.log("\n--force: carrying on without them.");
  }

  // §9D: with no worn-placement reference, REVEAL beats are blocked until one
  // exists. Saying so here beats discovering it at the act map.
  if (!bundle.assets.some((asset) => asset.kind === "product_placement")) {
    console.log("\nNote — no worn-placement reference in the bundle, so §9D blocks REVEAL beats for this build.");
  }

  await createBuild(options.slug, options.name, standards.version);
  await saveBundle(options.slug, bundle);

  // --- Execution
  setReporter(consoleReporter());

  if (!options.generate) {
    const dry = new DryRunGenerationClient();
    setGenerationClientFactory(async () => dry);
    console.log("\n--no-generate: calls are assembled and logged, nothing is submitted.");
    console.log("Model calls still run — the rehearsal is of the generation spend, not the whole build.\n");
  }

  const from = options.only ?? options.from;
  const chain = options.only === null;

  console.log(`\nBuilding against Standards V${standards.version}. Steps ${from}${chain ? "-5" : ""}.\n`);

  const failures: string[] = [];

  /**
   * §18: "neither step gates the other ... steps 1-5 ship as one delivery and
   * nothing inside waits." So a failed step is recorded and the run carries on
   * to everything that does not depend on it, rather than abandoning the
   * delivery. What genuinely depends on an earlier step guards itself — step 3
   * refuses without step 2's phrase inventory, by name.
   */
  const attempt = async (label: string, work: () => Promise<void>): Promise<boolean> => {
    try {
      await work();
      return true;
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // Step 1 feeds step 2 as context, never as a precondition.
  if (from <= 1 && (options.only === null || options.only === 1)) {
    await attempt("step 1", () => runAbsorbInspo(options.slug));
  }

  let stepTwoRan = true;
  if (from <= 2 && (options.only === null || options.only === 2)) {
    stepTwoRan = await attempt("step 2", () => runAbsorbScript(options.slug));
  }

  // Steps 3, 4 and 5 are one pass; entering at 4 or 5 skips what is already done.
  // Step 3 casts from step 2's inventory, so a failed step 2 is a real stop here.
  if (stepTwoRan) {
    if (options.only === 3 || (chain && from <= 3)) {
      await attempt("step 3", () => runCast(options.slug, { chain }));
    } else if (options.only === 4 || (chain && from === 4)) {
      await attempt("step 4", () => runLocations(options.slug, { chain }));
    } else if (options.only === 5 || (chain && from === 5)) {
      await attempt("step 5", () => runMaps(options.slug));
    }
  } else if (chain) {
    console.log("\n  Steps 3-5 not attempted: step 3 casts from step 2's phrase inventory.");
  }

  console.log(`\nArtefacts in ${paths(options.slug).dir}`);
  console.log(`Render them with:  npm run deliver -- ${options.slug}`);

  if (failures.length) {
    console.log(`\n${failures.length} step(s) failed:`);
    for (const failure of failures) console.log(`  ${failure}`);
    console.log(`\nFix, then resume with:  npm run build:run -- ${options.slug} --from <step>`);
    process.exitCode = 1;
    return;
  }

  console.log();
}

main().catch((error) => {
  console.error(`\n${explain(error)}\n`);
  process.exitCode = 1;
});
