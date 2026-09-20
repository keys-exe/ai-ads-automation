/**
 * Render a build's deliverables as local HTML.
 *
 *   npx tsx scripts/deliver.ts <slug>
 *
 * §16A requires every deliverable to arrive on an interactive surface, and this
 * pipeline has no server — so the widgets are written to
 * `builds/<slug>/deliveries/` as self-contained files and opened from disk.
 * Nothing in them reaches the network.
 *
 * The files under §E9 remain the working store: "they are written and not
 * presented. The widget is what the user sees."
 */

import { renderBuild } from "@/delivery/render";
import { paths } from "@/store";
import { explain } from "./lib/console-reporter";

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage: npm run deliver -- <slug>");

  const files = await renderBuild(slug);

  console.log(`\nRendered ${files.length} deliverable${files.length === 1 ? "" : "s"} for ${slug}:\n`);
  for (const file of files) {
    console.log(`  ${file.title}`);
    console.log(`    ${file.path}`);
  }

  const index = `${paths(slug).deliveries}/index.html`;
  console.log(`\nOpen:  file://${index}\n`);
}

main().catch((error) => {
  console.error(`\n${explain(error)}\n`);
  process.exitCode = 1;
});
