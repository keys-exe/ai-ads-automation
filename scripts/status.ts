/**
 * What state is this build in?
 *
 *   npx tsx scripts/status.ts [slug]
 *
 * Everything here is read from `run_ledger.json`. E3: the ledger is the source
 * for "§34 global scans, reissue passes, resume-after-interruption, and the
 * Open Decisions counts — computed, never hand-maintained." With no slug it
 * lists every build.
 *
 * §45: every count the standards impose is visible on the deliverable that
 * carries it, so the numbers are printed rather than summarised.
 */

import { listBuilds, readBuild, readLedger, paths } from "@/store";
import {
  actMap as actMapOf,
  characters as charactersOf,
  generationJobs as generationJobsOf,
  locations as locationsOf,
  phrases as phrasesOf,
} from "@/store/collections";
import { ARSENAL } from "@/generation/arsenal";
import { explain } from "./lib/console-reporter";

const STEP_NAMES: Record<string, string> = {
  "1": "absorb inspo video",
  "2": "absorb script and product",
  "3": "cast",
  "4": "property and locations",
  "5": "act map and wardrobe map",
};

async function main(): Promise<void> {
  const slug = process.argv[2];

  if (!slug) {
    const builds = await listBuilds();
    if (!builds.length) {
      console.log("\nNo builds yet. Create one by dropping a bundle in builds/<name>/inbox/ and running:");
      console.log("  npm run build:run -- <name>\n");
      return;
    }
    console.log("\nBUILDS");
    for (const build of builds) {
      const ledger = await readLedger(build.slug);
      const done = Object.values(ledger?.steps ?? {}).filter((s) => s.status === "done").length;
      console.log(`  ${build.slug.padEnd(24)} V${build.standardsVersion}  steps done: ${done}/5  updated ${build.updatedAt.slice(0, 16).replace("T", " ")}`);
    }
    console.log();
    return;
  }

  const build = await readBuild(slug);
  if (!build) throw new Error(`No build named "${slug}". Looked in ${paths(slug).dir}.`);

  const ledger = await readLedger(slug);
  console.log(`\n${build.name} · ${slug} · built against Standards V${ledger?.versionBuiltAgainst ?? build.standardsVersion}`);

  console.log("\nSTEPS");
  for (const step of ["1", "2", "3", "4", "5"]) {
    const state = ledger?.steps[step];
    const name = STEP_NAMES[step];
    if (!state) {
      console.log(`  ${step}. ${name.padEnd(30)} not run`);
      continue;
    }
    const detail = state.status === "failed" ? ` — ${state.error}` : state.status === "running" ? ` — ${state.stage}` : "";
    console.log(`  ${step}. ${name.padEnd(30)} ${state.status}${detail}`);
  }

  // --- §18A's Mode & Model Lock, as recorded rather than remembered (rule 3).
  const declared = ledger?.declared ?? {};
  if (declared.mode || declared.modelLock) {
    console.log("\nMODE & MODEL LOCK (§18A)");
    if (declared.mode) console.log(`  mode: ${declared.mode}`);
    for (const [beatClass, entry] of Object.entries(declared.modelLock ?? {})) {
      const params = [entry.variant, entry.quality, entry.resolution].filter(Boolean).join(" · ");
      console.log(`  ${beatClass.padEnd(28)} ${entry.model}${params ? ` · ${params}` : ""}`);
    }
  }

  // --- Counts. §45: a number the user has to ask for is a number nobody checks.
  const phrases = await phrasesOf(slug).all();
  const uncovered = phrases.filter((p) => !p.disposition).length;
  const cast = await charactersOf(slug).all();
  const locations = await locationsOf(slug).all();
  const beats = Object.values(ledger?.beats ?? {});
  const actMapRows = await actMapOf(slug).all();

  console.log("\nCOUNTS");
  console.log(`  phrases (§27B)          ${phrases.length}   uncovered: ${uncovered}`);
  console.log(`  cast (§19)              ${cast.length}   locked: ${cast.filter((c) => c.sheetStatus === "locked").length}   needs a human: ${cast.filter((c) => c.sheetStatus !== "locked").length}`);
  console.log(`  locations (§30C)        ${locations.length}   plated: ${locations.filter((l) => l.tier === "PLATED").length}   held: ${locations.filter((l) => l.plateStatus === "held_property_plate_failed").length}`);
  console.log(`  act map rows (§E4)      ${actMapRows.length}`);
  console.log(`  beats in the ledger     ${beats.length}   delivered: ${beats.filter((b) => b.delivered).length}`);

  // --- §5 and §44.47: the logged model is the evidence, so it is read back.
  const jobs = await generationJobsOf(slug).all();
  if (jobs.length) {
    const completed = jobs.filter((job) => job.status === "completed");
    const offArsenal = completed.filter(
      (job) => job.loggedModel && !ARSENAL.includes(job.loggedModel as never),
    );
    console.log("\nGENERATION (§16B, §5)");
    console.log(`  jobs                    ${jobs.length}   completed: ${completed.length}`);
    if (offArsenal.length) {
      console.log(`  ✗ ${offArsenal.length} job(s) logged a model outside the arsenal — §44.47 makes these failed generations:`);
      for (const job of offArsenal) console.log(`      ${job.ref} · logged ${job.loggedModel}`);
    } else if (completed.length) {
      console.log("  ✓ every completed job logged an arsenal model");
    }
  }

  // --- Anything §34 has invalidated.
  const flagged = beats.filter((beat) => beat.reissueFlag);
  if (flagged.length) {
    console.log("\nREISSUE PENDING (§34)");
    for (const beat of flagged) {
      console.log(`  ${beat.beatId} · ${beat.reissueFlag!.section} · ${beat.reissueFlag!.reason}`);
    }
  }

  if (declared.overrides?.length) {
    console.log("\nOVERRIDES AGAINST THE STANDARD (§45 — recorded, not applied quietly)");
    for (const override of declared.overrides) {
      console.log(`  ${override.section} · ${override.decision}`);
      console.log(`      ${override.reason}`);
    }
  }

  console.log(`\n  ${paths(slug).dir}\n`);
}

main().catch((error) => {
  console.error(`\n${explain(error)}\n`);
  process.exitCode = 1;
});
