/**
 * §16A's routing table, applied.
 *
 * "Every artefact class has one widget type." Each renderer below takes what a
 * step actually wrote and emits the widget §16A routes it to — Navigator for
 * anything with more than one dimension, Spec card for labelled fields, Ledger
 * for one-row-per-item, Prompt widget for anything with a prompt in it.
 *
 * Deliverables are self-contained HTML files opened from disk. §16A requires an
 * interactive widget, not a served one, so there is no network dependency in
 * any of them: no CDN, no font fetch, no script tag pointing anywhere.
 *
 * What is NOT rendered here: beat prompts. Steps 6-8 are not built, so no beat
 * has a T2I or I2V prompt yet. The carousel is used for the artefacts that do
 * carry prompts today — the §19 reference sheets and the §30G/§30C plates.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AbsorptionSheet, ScriptAbsorption } from "@/processes/schemas";
import type { MapsOutput } from "@/processes/schemas-cast";
import { getArtifact, paths, readBuild, readLedger } from "@/store";
import {
  actMap as actMapOf,
  characters as charactersOf,
  claims as claimsOf,
  generationJobs as generationJobsOf,
  locations as locationsOf,
  locks as locksOf,
  phrases as phrasesOf,
  properties as propertiesOf,
} from "@/store/collections";
import {
  badge,
  carousel,
  CAROUSEL_SCRIPT,
  copyBlock,
  ledgerTable,
  navigator,
  NAVIGATOR_SCRIPT,
  page,
  specCard,
  text,
  type BeatView,
  type Metric,
  type Tab,
} from "./widgets";
import { escapeHtml } from "./highlight";

const SCRIPTS = `${NAVIGATOR_SCRIPT}\n${CAROUSEL_SCRIPT}`;

export interface RenderedFile {
  /** Absolute path of the written file. */
  path: string;
  title: string;
}

export async function renderBuild(slug: string): Promise<RenderedFile[]> {
  const build = await readBuild(slug);
  if (!build) throw new Error(`No build named "${slug}".`);

  const ledger = await readLedger(slug);
  const dir = paths(slug).deliveries;
  await mkdir(dir, { recursive: true });

  const subtitle = `${slug} · built against Standards V${ledger?.versionBuiltAgainst ?? build.standardsVersion}`;
  const written: RenderedFile[] = [];

  const emit = async (file: string, title: string, body: string): Promise<void> => {
    const path = join(dir, file);
    await writeFile(path, page({ title, subtitle, body, script: SCRIPTS }), "utf8");
    written.push({ path, title });
  };

  const absorption = await getArtifact<AbsorptionSheet>(slug, "absorption_sheet");
  if (absorption) {
    const measurements = await getArtifact<Record<string, unknown>>(slug, "measurements");
    await emit("absorption.html", "Absorption Sheet", absorptionNavigator(absorption, measurements));
  }

  const script = await getArtifact<ScriptAbsorption>(slug, "script_absorption");
  if (script) {
    await emit("step-2-locks.html", "Step 2 — locks, claims and the model lock", await stepTwo(slug, script));
    await emit("coverage.html", "Phrase inventory and coverage", await coverage(slug, script));
  }

  const cast = await charactersOf(slug).all();
  if (cast.length) await emit("cast.html", "Cast — reference sheets", await castPage(slug));

  const locations = await locationsOf(slug).all();
  if (locations.length) await emit("locations.html", "Property and locations", await locationsPage(slug));

  const maps = await getArtifact<MapsOutput & { independentAudits?: unknown }>(slug, "maps");
  if (maps) {
    await emit("act-map.html", "Act map", await actMapPage(slug, maps));
    await emit("wardrobe.html", "Wardrobe map", wardrobePage(maps));
  }

  await emit("index.html", `${build.name} — deliverables`, indexPage(written, ledger));
  return written;
}

/* ------------------------------------------------------------------ *
 * Absorption Sheet — Navigator
 * ------------------------------------------------------------------ */

function absorptionNavigator(sheet: AbsorptionSheet, measurements?: Record<string, unknown>): string {
  const part1 = (measurements?.part1Table ?? []) as Array<{
    instrument: string; settles: string; value: string; method: string;
  }>;

  const format = measurements?.format as { durationSeconds?: number } | undefined;
  const scenes = measurements?.scenes as { shotCount?: number; meanShotLength?: number } | undefined;
  const silence = (measurements?.silence ?? []) as Array<{ windows?: unknown[] }>;

  // §16A: "metric cards for duration, shot count, mean shot length, silence".
  const metrics: Metric[] = [
    { label: "duration", value: format?.durationSeconds ? `${format.durationSeconds.toFixed(1)}s` : "—" },
    { label: "shots", value: scenes?.shotCount ?? "—" },
    { label: "mean shot", value: scenes?.meanShotLength ? `${scenes.meanShotLength}s` : "—" },
    { label: "silence windows", value: silence[0]?.windows?.length ?? "—" },
    { label: "build type", value: sheet.formatRead.buildType },
    { label: "acts", value: sheet.formatRead.actCount },
  ];

  const tabs: Tab[] = [
    {
      label: "Measured table",
      body:
        ledgerTable(
          [{ label: "Instrument" }, { label: "Settles" }, { label: "Value" }, { label: "Method" }],
          part1.map((row) => [
            text(row.instrument), text(row.settles), text(row.value), badge(row.method),
          ]),
        ) +
        // §45: a derived claim never sits unmarked beside a measured one.
        `<p style="font-size:13px;color:var(--text-secondary);margin-top:12px">TH/B-roll ratio ${escapeHtml(sheet.thBrollRatio.ratio)} — ${badge("derived")} no instrument settles it; it is read off the sampled frames.</p>` +
        (sheet.labelVsMeasurement
          ? `<p style="font-size:13px;color:var(--text-secondary)"><strong>Label vs measurement:</strong> ${escapeHtml(sheet.labelVsMeasurement)}</p>`
          : ""),
    },
    {
      label: "Structure map",
      body: ledgerTable(
        [{ label: "#", numeric: true }, { label: "Start", numeric: true }, { label: "Length", numeric: true }, { label: "What it does" }],
        sheet.structureMap.map((shot, i) => [
          text(i + 1),
          text((shot as Record<string, unknown>).startSeconds),
          text((shot as Record<string, unknown>).lengthSeconds),
          text((shot as Record<string, unknown>).description ?? (shot as Record<string, unknown>).job),
        ]),
      ),
    },
    {
      label: "Style Lock",
      body: specCard("Style Lock", Object.entries(sheet.styleLock as Record<string, unknown>).map(([key, value]) => ({
        label: key,
        value: text(Array.isArray(value) ? value.join(" · ") : value),
      }))),
    },
    {
      label: "Script absorption",
      body:
        ledgerTable(
          [{ label: "Reference phrase" }, { label: "Job" }],
          sheet.referencePhrases.map((phrase) => {
            const row = phrase as Record<string, unknown>;
            return [text(row.text), text(row.structuralJob ?? row.job)];
          }),
        ) +
        `<h2 class="section">Voice fingerprint</h2>` +
        specCard("Voice fingerprint", Object.entries(sheet.voiceFingerprint as Record<string, unknown>).map(([key, value]) => ({
          label: key,
          value: text(Array.isArray(value) ? value.join(" · ") : value),
        }))),
    },
    {
      label: "Surfaced, not absorbed",
      body: sheet.surfacedConflicts.length
        ? ledgerTable(
            [{ label: "What" }, { label: "Why it is not absorbed" }],
            sheet.surfacedConflicts.map((conflict) => {
              const row = conflict as Record<string, unknown>;
              return [text(row.device ?? row.what), text(row.reason ?? row.why)];
            }),
          )
        : "<p>Nothing surfaced.</p>",
    },
    {
      label: "Beat-it plan",
      body: ledgerTable(
        [{ label: "Where" }, { label: "The reference" }, { label: "Ours, and why it is better" }],
        sheet.beatItPlan.map((delta) => {
          const row = delta as Record<string, unknown>;
          return [text(row.where ?? row.beat), text(row.reference), text(row.ours ?? row.delta)];
        }),
      ),
    },
  ];

  return navigator("absorption", "Absorption Sheet", metrics, tabs);
}

/* ------------------------------------------------------------------ *
 * Step 2 — locks ledger, claims ledger, Product Sheet spec card
 * ------------------------------------------------------------------ */

async function stepTwo(slug: string, script: ScriptAbsorption): Promise<string> {
  const lockRows = await locksOf(slug).all();
  const claimRows = await claimsOf(slug).all();

  // §18A: "the Mode & Model Lock ships as a ledger widget — one row per beat
  // class, the model and params, a status badge, and the step-2 read."
  const modelLock = ledgerTable(
    [{ label: "Beat class" }, { label: "Model" }, { label: "Params", numeric: true }, { label: "Why" }],
    script.modelRoutes.map((route) => [
      text(route.beatClass),
      text(route.model),
      text([route.variant, route.quality, route.resolution].filter(Boolean).join(" · ")),
      text(route.reason),
    ]),
  );

  const locks = ledgerTable(
    [{ label: "Lock" }, { label: "Decision" }, { label: "Binds", numeric: true }, { label: "Why" }],
    lockRows.map((lock) => [text(lock.key), text(lock.value), badge(`§${lock.section}`), text(lock.reason)]),
  );

  // §43A: tier 3 rows carry a warning icon and the beat is BLOCKED.
  const claims = claimRows.length
    ? ledgerTable(
        [{ label: "Claim" }, { label: "Tier", numeric: true }, { label: "Kind" }, { label: "Consequence" }],
        claimRows.map((claim) => [
          text(claim.text),
          badge(claim.tier === 3 ? "⚠ Tier 3" : `Tier ${claim.tier}`),
          text(claim.kind),
          text(claim.consequence ?? claim.qualification ?? claim.source),
        ]),
      )
    : "<p>No claims harvested.</p>";

  const productSheet = specCard(
    `Product Sheet — ${script.productSheet.status}`,
    script.productSheet.fields.map((field) => ({
      label: field.field,
      value: field.value
        ? text(field.value)
        : `${badge("gap")} ${text(field.gap)}`,
    })),
  );

  // §9D's consequence, stated where it is decided rather than discovered later.
  const placement = specCard("Placement lock (§9A-P, §9D)", [
    { label: "Worn reference present", value: badge(script.placementLock.present ? "yes" : "no") },
    { label: "[SITE]", value: text(script.placementLock.site) },
    { label: "[LANDMARK]", value: text(script.placementLock.landmark) },
    { label: "[OFFSET]", value: text(script.placementLock.offset) },
    { label: "Consequence", value: text(script.placementLock.consequence) },
  ]);

  const collisions = script.collisions.length
    ? `<h2 class="section">Collisions (§ order of authority — flagged, never rewritten)</h2>` +
      ledgerTable(
        [{ label: "Script line" }, { label: "Collides with" }, { label: "Recommendation" }],
        script.collisions.map((collision) => [
          text(collision.scriptLine), text(collision.collidesWith), text(collision.recommendation),
        ]),
      )
    : "";

  return `<section class="card"><h2 class="section" style="margin-top:0">Mode &amp; Model Lock (§18A) — mode: ${escapeHtml(script.modeLock.mode)}</h2>
  <p style="font-size:13px;color:var(--text-secondary)">${escapeHtml(script.modeLock.reason)}</p>
  ${modelLock}</section>
<section class="card"><h2 class="section" style="margin-top:0">Locks (§18 step 2)</h2>${locks}</section>
<section class="card"><h2 class="section" style="margin-top:0">Claims pass (§43A)</h2>${claims}</section>
${productSheet}
${placement}
${collisions ? `<section class="card">${collisions}</section>` : ""}`;
}

/* ------------------------------------------------------------------ *
 * Coverage — Navigator, tabs per act
 * ------------------------------------------------------------------ */

async function coverage(slug: string, script: ScriptAbsorption): Promise<string> {
  const rows = await phrasesOf(slug).all();
  const maps = await getArtifact<MapsOutput>(slug, "maps");

  const count = (prefix: string) =>
    rows.filter((row) => (row.disposition ?? "").startsWith(prefix)).length;

  const metrics: Metric[] = [
    { label: "phrases", value: rows.length },
    { label: "BR", value: count("BR") },
    { label: "TH", value: count("TH") },
    { label: "MECH", value: count("MECH") },
    { label: "merged", value: count("MERGED") },
    { label: "blocked", value: count("BLOCKED") },
    // §27B: an uncovered count above zero is an undelivered act.
    { label: "uncovered", value: rows.filter((row) => !row.disposition).length },
  ];

  const acts = [...new Set(rows.map((row) => row.actHint ?? "unassigned"))];
  const tabs: Tab[] = acts.map((act) => ({
    label: act,
    body: ledgerTable(
      [{ label: "ID", numeric: true }, { label: "Phrase" }, { label: "Job" }, { label: "Disposition", numeric: true }],
      rows
        .filter((row) => (row.actHint ?? "unassigned") === act)
        .map((row) => [
          text(row.phraseId),
          text(row.text),
          text(row.structuralJob),
          row.disposition ? badge(row.disposition) : badge("uncovered"),
        ]),
    ),
  }));

  const line = maps?.coverage?.reconciliationLine ?? script.reconciliation.note;

  return (
    navigator("coverage", "Phrase inventory and coverage ledger", metrics, tabs) +
    // §16A: reconciliation lines are chat prose, never a widget — outside everything.
    `<p style="font-size:13px;color:var(--text-secondary);margin:0 4px">${escapeHtml(line)}</p>`
  );
}

/* ------------------------------------------------------------------ *
 * Cast — prompt widget plus the §19A axis table
 * ------------------------------------------------------------------ */

async function castPage(slug: string): Promise<string> {
  const cast = await charactersOf(slug).all();
  const jobs = await generationJobsOf(slug).all();

  const beats: BeatView[] = cast.map((member) => {
    const job = jobs.find((row) => row.purpose === "avatar_sheet" && row.ref === member.characterId);
    const params = job
      ? [job.model, (job.params as Record<string, unknown>).variant, (job.params as Record<string, unknown>).quality,
         (job.params as Record<string, unknown>).resolution, (job.params as Record<string, unknown>).aspect_ratio]
          .filter(Boolean).join(" · ")
      : "no call recorded";

    return {
      beatId: member.characterId,
      name: member.name,
      scriptLine: "",
      slots: `${member.role} · ${member.isNarrator ? "narrator" : "side cast"} · ${member.beatCount} beats`,
      faceState: null,
      extraBadges: [member.sheetStatus, ...(member.speaks ? ["speaks"] : [])],
      seed: job ? { raw: job.prompt, params, register: "prose" as const } : null,
      clip: null,
    };
  });

  // §19A's eight axes as rows, with the clearance count per roster entry.
  const axisRows = cast.map((member) => [
    text(member.characterId),
    text(member.name),
    ...Object.values((member.axes ?? {}) as Record<string, unknown>)
      .slice(0, 8)
      .map((value) => text(typeof value === "object" ? JSON.stringify(value) : value)),
    badge(`${Array.isArray(member.clearance) ? member.clearance.length : 0} cleared`),
  ]);

  const axisColumns = [
    { label: "ID", numeric: true },
    { label: "Name" },
    ...Object.keys((cast[0]?.axes ?? {}) as Record<string, unknown>).slice(0, 8).map((key) => ({ label: key })),
    { label: "§19A", numeric: true },
  ];

  const sheets = beats.some((beat) => beat.seed)
    ? carousel("cast-sheets", "Reference sheet prompts", beats)
    : `<section class="card"><p>No sheet prompts recorded yet — step 3 has not generated.</p></section>`;

  return `${sheets}
<section class="card"><h2 class="section" style="margin-top:0">Roster Ledger — §19A axes</h2>
${ledgerTable(axisColumns, axisRows)}
<p style="font-size:13px;color:var(--text-secondary);margin-top:12px">A sheet marked <code>locked</code> passed the §19 panel check automatically. E1 marks that check HUMAN, so an automatic pass locks the sheet to let the chain proceed and still queues the eyeball — it is never recorded as human-checked.</p>
</section>`;
}

/* ------------------------------------------------------------------ *
 * Locations — one spec card per location, property first
 * ------------------------------------------------------------------ */

async function locationsPage(slug: string): Promise<string> {
  const props = await propertiesOf(slug).all();
  const locs = await locationsOf(slug).all();
  const jobs = await generationJobsOf(slug).all();

  const propertyCards = props.map((property) => {
    const job = jobs.find((row) => row.purpose === "property_plate" && row.ref === property.dwellingId);
    return specCard(`Property — ${property.dwellingId}`, [
      { label: "Plate status", value: badge(property.plateStatus) },
      { label: "Plate job", value: text(property.plateJobId) },
      ...Object.entries(property as Record<string, unknown>)
        .filter(([key]) => !["dwellingId", "plateStatus", "plateJobId", "plateUrl", "plateCheck", "platePrompt"].includes(key))
        .map(([key, value]) => ({
          label: key,
          value: text(typeof value === "object" ? JSON.stringify(value) : value),
        })),
      ...(job ? [{ label: "Plate prompt", value: copyBlock(job.prompt) }] : []),
    ]);
  });

  const locationCards = locs.map((location) => {
    const job = jobs.find((row) => row.purpose === "location_plate" && row.ref === location.locationId);
    const sheet = (location.sheet ?? {}) as Record<string, unknown>;
    return specCard(`${location.locationId} — ${location.name}`, [
      { label: "Tier (§30C 1a)", value: badge(location.tier) },
      { label: "Plate status", value: badge(location.plateStatus) },
      { label: "Dwelling", value: text(location.dwellingId) },
      { label: "Beats", value: text(location.beatCount) },
      { label: "Anchors", value: text((location.anchors ?? []).join(" · ")) },
      { label: "GEO-LINE", value: text(location.geoLine) },
      ...Object.entries(sheet).map(([key, value]) => ({
        label: key,
        value: typeof value === "string" && value.length > 120
          ? copyBlock(value)
          : text(typeof value === "object" ? JSON.stringify(value) : value),
      })),
      ...(job ? [{ label: "Plate prompt", value: copyBlock(job.prompt) }] : []),
    ]);
  });

  const held = locs.filter((l) => l.plateStatus === "held_property_plate_failed");
  const note = held.length
    ? `<section class="card"><p>${held.length} room(s) held: their dwelling's property plate did not pass, and §30G forbids building a location plate against nothing — that is the "six houses" failure the section exists to prevent.</p></section>`
    : "";

  return `${note}${propertyCards.join("\n")}\n${locationCards.join("\n")}`;
}

/* ------------------------------------------------------------------ *
 * Act map — Navigator, tabs per act
 * ------------------------------------------------------------------ */

async function actMapPage(slug: string, maps: MapsOutput): Promise<string> {
  const rows = await actMapOf(slug).all();
  const acts = [...new Set(rows.map((row) => row.act))];

  const metrics: Metric[] = [
    { label: "beats", value: rows.length },
    { label: "acts", value: acts.length },
    { label: "story days", value: maps.storyDays.length },
    { label: "capture events", value: maps.captureEvents.length },
    { label: "uncovered", value: maps.coverage.uncovered },
  ];

  // §16A: "tabs per act, each act listing its beats with the six-slot row".
  const tabs: Tab[] = acts.map((act) => ({
    label: act,
    body: ledgerTable(
      [
        { label: "Beat", numeric: true },
        { label: "Type", numeric: true },
        { label: "Six-slot row (§30B)" },
        { label: "Day / event", numeric: true },
        { label: "Product", numeric: true },
        { label: "Dur", numeric: true },
      ],
      rows
        .filter((row) => row.act === act)
        .map((row) => [
          text(row.beatId),
          badge(row.type),
          `<span class="slots"><span class="fn">${escapeHtml(row.function ?? "—")}</span> · ${escapeHtml(
            [row.subject, row.rig, row.energy, row.locationId].filter(Boolean).join(" · "),
          )}</span>`,
          text(`${row.storyDay} / ${row.captureEventId}`),
          badge(row.productState),
          text(row.duration ? `${row.duration}s` : null),
        ]),
    ),
  }));

  return (
    navigator("act-map", "Act map", metrics, tabs) +
    `<p style="font-size:13px;color:var(--text-secondary);margin:0 4px">${escapeHtml(maps.coverage.reconciliationLine)}</p>`
  );
}

/* ------------------------------------------------------------------ *
 * Wardrobe — Ledger, with its audits
 * ------------------------------------------------------------------ */

function wardrobePage(maps: MapsOutput): string {
  const dayRows = maps.storyDays.map((day) => [
    text(day.day),
    text(day.act),
    text(day.subject),
    text(day.outfit.base),
    text(day.outfit.mid),
    text(day.outfit.outer),
    text(day.outfit.lower),
    text(day.outfit.foot),
    text(day.outfit.accent),
    badge(day.colourFamily),
  ]);

  const eventRows = maps.captureEvents.map((event) => [
    text(event.eventId),
    text(event.storyDay),
    text(event.locationId),
    badge(event.visibility),
    text(event.alibi),
    text(event.beats.join(", ")),
  ]);

  // §14A: "a map delivered without its audits is undelivered."
  const audits = Object.entries(maps.wardrobeAudits).map(([key, audit]) => [
    text(key.toUpperCase()),
    badge(audit.pass ? "pass" : "fail"),
    text(audit.detail),
  ]);

  return `<section class="card"><h2 class="section" style="margin-top:0">Wardrobe Ledger — one outfit row per story day (§14A)</h2>
${ledgerTable(
  [
    { label: "Day", numeric: true }, { label: "Act", numeric: true }, { label: "Subject" },
    { label: "BASE" }, { label: "MID" }, { label: "OUTER" }, { label: "LOWER" },
    { label: "FOOT" }, { label: "ACCENT" }, { label: "Colour", numeric: true },
  ],
  dayRows,
)}</section>
<section class="card"><h2 class="section" style="margin-top:0">Capture events (§E8)</h2>
${ledgerTable(
  [
    { label: "Event", numeric: true }, { label: "Story day", numeric: true }, { label: "Location", numeric: true },
    { label: "Visibility", numeric: true }, { label: "Alibi" }, { label: "Beats" },
  ],
  eventRows,
)}</section>
<section class="card"><h2 class="section" style="margin-top:0">The four wardrobe audits (§14A)</h2>
${ledgerTable([{ label: "Audit", numeric: true }, { label: "Result", numeric: true }, { label: "Detail" }], audits)}</section>`;
}

/* ------------------------------------------------------------------ *
 * Index
 * ------------------------------------------------------------------ */

function indexPage(files: RenderedFile[], ledger: Awaited<ReturnType<typeof readLedger>>): string {
  const links = files
    .filter((file) => !file.path.endsWith("index.html"))
    .map((file) => {
      const name = file.path.split("/").pop()!;
      return `<div class="spec-row"><div class="k"><a href="./${escapeHtml(name)}">${escapeHtml(file.title)}</a></div><div class="v" style="color:var(--text-secondary);font-size:13px">${escapeHtml(name)}</div></div>`;
    })
    .join("\n");

  const steps = ["1", "2", "3", "4", "5"]
    .map((step) => {
      const state = ledger?.steps[step];
      return [text(step), text(state?.kind ?? "—"), state ? badge(state.status) : badge("not run"), text(state?.error)];
    });

  return `<section class="card"><h2 class="section" style="margin-top:0">Deliverables</h2>
${links}
</section>
<section class="card"><h2 class="section" style="margin-top:0">Steps</h2>
${ledgerTable([{ label: "Step", numeric: true }, { label: "Kind" }, { label: "Status", numeric: true }, { label: "Error" }], steps)}
</section>`;
}
