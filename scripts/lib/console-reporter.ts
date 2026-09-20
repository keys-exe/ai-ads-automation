/**
 * §16B on a terminal.
 *
 * The three parts, in order, for every generation call:
 *
 *   BEFORE  the label line, immediately above the call and never after it
 *   BATCH   the manifest, one line per item in submission order, so item n is
 *           beat n and a manifest that drifts from its payload is visible
 *   AFTER   every job id written back against its ref, in the same order —
 *           "a bare job id in prose is undelivered"
 *
 * §45's show-the-number rule applies here too: counts are printed, not implied.
 */

import type { ReportEvent } from "@/lib/report";
import { friendly } from "@/lib/friendly-errors";

/** Params worth seeing on the label line. The rest is noise at 90 beats. */
const SHOWN_PARAMS = ["variant", "quality", "resolution", "aspect_ratio", "duration"] as const;

function paramLine(model: string, params: Record<string, unknown>): string {
  const shown = SHOWN_PARAMS
    .map((key) => (params[key] === undefined || params[key] === null ? null : `${key}=${String(params[key])}`))
    .filter(Boolean);

  const medias = params.medias;
  if (Array.isArray(medias) && medias.length) {
    // §5: attachments are named, because "image + names is the pair".
    const roles = medias.map((media) => (media as { role?: string }).role ?? "?");
    shown.push(`attachments=${roles.join("+")}`);
  }

  return [model, ...shown].join(" · ");
}

export function consoleReporter(): (event: ReportEvent) => void {
  return (event) => {
    switch (event.kind) {
      case "step-start":
        console.log(`\n▸ STEP ${event.step} · ${event.label}`);
        break;

      case "stage":
        console.log(`    · ${event.stage}`);
        break;

      case "manifest": {
        console.log(`\n  MANIFEST · ${event.purpose} · ${event.items.length} in submission order`);
        event.items.forEach((item, index) => {
          console.log(`   [${index}] ${item.ref} · ${item.label}`);
          console.log(`        ${paramLine(item.model, item.params)}`);
        });
        break;
      }

      case "outcomes": {
        console.log(`\n  JOB IDS · ${event.purpose}`);
        for (const item of event.items) {
          const logged = item.loggedModel ? ` · logged ${item.loggedModel}` : "";
          const attempts = item.attempts > 1 ? ` · attempt ${item.attempts}` : "";
          console.log(`   ${item.ref} · ${item.jobId ?? "(no job id)"} · ${item.status}${logged}${attempts}`);
        }
        break;
      }

      case "step-done": {
        const usage = event.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        const tokens = usage?.inputTokens
          ? ` · ${usage.inputTokens.toLocaleString()} in / ${(usage.outputTokens ?? 0).toLocaleString()} out`
          : "";
        console.log(`  ✓ step ${event.step} done${tokens}`);
        break;
      }

      case "step-failed":
        console.log(`  ✗ step ${event.step} failed — ${event.error}`);
        break;

      case "note":
        console.log(`  ${event.text}`);
        break;
    }
  };
}

/** One sentence and the fix, with the original kept underneath. */
export function explain(error: unknown): string {
  const readable = friendly(error);
  const lines = [readable.summary];
  if (readable.fix) lines.push(`  → ${readable.fix}`);
  if (readable.technical && readable.technical !== readable.summary) {
    lines.push(`  (${readable.technical})`);
  }
  return lines.join("\n");
}
