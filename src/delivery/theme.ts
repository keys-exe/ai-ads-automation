/**
 * §16A's locked surface, as CSS.
 *
 * "The plate below is the accepted carousel. It is not a suggestion of how the
 * spec might be built; it **is** the spec at implementation depth, and a batch
 * that deviates from it is a §34 correction, not a style preference."
 *
 * So the numbers here are quoted, not chosen: 12px radius on the card, 0.5px
 * borders, 22x8 active dot, 24px script line, 11.5px prompt body, 1.4s on the
 * copy flip. Where this file makes a decision the standard does not, it is
 * marked.
 *
 * Two things §16A is explicit about that are easy to get wrong:
 *
 *   - **Both dark selectors.** The six highlight colours are overridden under
 *     `:root[data-mode="dark"]` AND `@media (prefers-color-scheme: dark)`, "so
 *     the card flips with the host rather than with a guess about it."
 *   - **Hex values are never written inline.** They bind to local variables
 *     here and the markup refers only to the variables.
 */

/** §16A's colour table, both modes, verbatim. */
export const HIGHLIGHT_COLOURS = {
  jsonKey: { light: "#534AB7", dark: "#AFA9EC" },
  stringValue: { light: "#0F6E56", dark: "#9FE1CB" },
  exactWords: { light: "#185FA5", dark: "#85B7EB" },
  punctuation: { light: "#5F5E5A", dark: "#B4B2A9" },
  proseHeader: { light: "#854F0B", dark: "#FAC775" },
  negatives: { light: "#A32D2D", dark: "#F09595" },
} as const;

function highlightVars(mode: "light" | "dark"): string {
  return Object.entries(HIGHLIGHT_COLOURS)
    .map(([name, pair]) => `  --hl-${kebab(name)}: ${pair[mode]};`)
    .join("\n");
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * The surface tokens.
 *
 * §16A names these variables (`--surface-1`, `--border-stronger`,
 * `--fill-accent`, `--font-voice`) but does not fix their values — they belong
 * to the host. The values below are this pipeline's, chosen so the page reads
 * the same offline as the app did, and they are the only part of this file that
 * is not quoted from the standard.
 */
export const THEME_CSS = `
:root {
  --surface-0: #FBFAF8;
  --surface-1: #F4F2EE;
  --surface-2: #FFFFFF;
  --bg-neutral: #EFEDE8;
  --border: #D9D5CC;
  --border-stronger: #B6B1A6;
  --border-accent: #C0783A;
  --fill-accent: #C0783A;
  --text-primary: #1F1E1B;
  --text-secondary: #56534C;
  --text-muted: #85817A;
  --radius: 6px;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --font-voice: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
${highlightVars("light")}
}

:root[data-mode="dark"] {
  --surface-0: #14130F;
  --surface-1: #1C1B17;
  --surface-2: #232219;
  --bg-neutral: #2A2822;
  --border: #38352D;
  --border-stronger: #565248;
  --border-accent: #D9955A;
  --fill-accent: #D9955A;
  --text-primary: #F2F0EA;
  --text-secondary: #B4B1A8;
  --text-muted: #85817A;
${highlightVars("dark")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-mode="light"]) {
    --surface-0: #14130F;
    --surface-1: #1C1B17;
    --surface-2: #232219;
    --bg-neutral: #2A2822;
    --border: #38352D;
    --border-stronger: #565248;
    --border-accent: #D9955A;
    --fill-accent: #D9955A;
    --text-primary: #F2F0EA;
    --text-secondary: #B4B1A8;
    --text-muted: #85817A;
${highlightVars("dark")}
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 24px 16px 64px;
  background: var(--surface-0);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.5;
}

main { max-width: 860px; margin: 0 auto; }

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* --- Page header ------------------------------------------------- */

.page-head { margin-bottom: 20px; }
.page-head h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
.page-head .sub { color: var(--text-secondary); font-size: 13px; font-family: var(--font-mono); }

/* --- The card. §16A: one card holds the whole batch. -------------- */

.card {
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 20px;
}

/* Row 1 — nav header. Its own row, ruled off from the card body. */
.nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--border);
}

.nav-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  background: transparent;
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
}
/* "At the ends of a batch they render disabled, never hidden." */
.nav-btn[disabled] { opacity: 0.35; cursor: default; }
.nav-btn svg { width: 18px; height: 18px; }

/* Row 2 — dots. Width alone does not read as a selection; colour and width together do. */
.dots { display: flex; align-items: center; gap: 6px; }
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--border-stronger);
  cursor: pointer; border: none; padding: 0;
}
.dot.active {
  width: 22px; height: 8px; border-radius: 4px;
  background: var(--fill-accent);
}

/* Row 3 — id and badges. */
.id-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-top: 12px; }
.beat-id { font-family: var(--font-mono); font-size: 17px; font-weight: 500; }
.badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.badge {
  background: var(--bg-neutral);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: var(--radius);
  white-space: nowrap;
}

/* Row 4 — script panel. A single-sided border never takes rounded corners. */
.script-panel {
  background: var(--surface-1);
  border-left: 3px solid var(--border-accent);
  border-radius: 0;
  padding: 10px 14px;
  margin: 12px 0;
}
.script-label {
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.script-line {
  font-family: var(--font-voice);
  font-size: 24px;
  line-height: 1.4;
  margin-top: 4px;
}

/* Row 5 — six-slot row. */
.slots { font-size: 14px; line-height: 1.6; color: var(--text-secondary); }
.slots .fn { font-weight: 500; color: var(--text-primary); }

/* Row 6 — control row. The active toggle is filled neutral, never accent. */
.control-row { display: flex; align-items: center; justify-content: space-between; margin: 12px 0 8px; }
.toggle { display: flex; gap: 6px; }
.toggle button, .copy-btn {
  font-size: 14px;
  font-family: inherit;
  padding: 5px 12px;
  background: transparent;
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
}
.toggle button.active {
  background: var(--surface-1);
  border-color: var(--border-stronger);
  color: var(--text-primary);
}
.copy-btn { display: inline-flex; align-items: center; gap: 6px; }
.copy-btn svg { width: 14px; height: 14px; }

/* Row 7 — call params, directly above the pre. */
.params { font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }

/* Row 8 — prompt body. The only small type on the card. */
pre.prompt {
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--surface-1);
  padding: 12px;
  border-radius: var(--radius);
  margin: 0;
}

/* --- Highlight classes. Hex is never inline; these bind to the vars. --- */
.hl-key { color: var(--hl-json-key); }
.hl-value { color: var(--hl-string-value); }
.hl-exact { color: var(--hl-exact-words); }
.hl-punct { color: var(--hl-punctuation); }
.hl-caps { color: var(--hl-prose-header); }
.hl-neg { color: var(--hl-negatives); }

/* --- Navigator: metric cards, then tab bar, then one panel at a time. --- */
.metrics { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.metric {
  background: var(--surface-1);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 96px;
}
.metric .n { font-family: var(--font-mono); font-size: 18px; font-weight: 500; }
.metric .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }

.tabs { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 0.5px solid var(--border); padding-bottom: 10px; margin-bottom: 12px; }
.tab {
  font-size: 13px; font-family: inherit;
  padding: 5px 11px;
  background: transparent;
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
}
.tab.active { background: var(--surface-1); border-color: var(--border-stronger); color: var(--text-primary); }
.panel[hidden] { display: none; }

/* --- Spec card and ledger tables. --- */
table.ledger { width: 100%; border-collapse: collapse; font-size: 13px; }
table.ledger th {
  text-align: left; font-weight: 500; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted);
  border-bottom: 0.5px solid var(--border); padding: 6px 8px;
}
table.ledger td { padding: 6px 8px; border-bottom: 0.5px solid var(--border); vertical-align: top; }
table.ledger tr:last-child td { border-bottom: none; }
table.ledger td.num { font-family: var(--font-mono); white-space: nowrap; }

.spec-row { display: flex; gap: 16px; padding: 7px 0; border-bottom: 0.5px solid var(--border); }
.spec-row:last-child { border-bottom: none; }
.spec-row .k { flex: 0 0 200px; color: var(--text-secondary); font-size: 13px; }
.spec-row .v { flex: 1; min-width: 0; }

h2.section { font-size: 15px; font-weight: 600; margin: 24px 0 10px; }

@media (max-width: 620px) {
  .spec-row { flex-direction: column; gap: 2px; }
  .spec-row .k { flex: none; }
  .script-line { font-size: 20px; }
}
`;
