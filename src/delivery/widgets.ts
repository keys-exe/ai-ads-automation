/**
 * §16A's four widget shapes.
 *
 * "Every deliverable in the build ships as an interactive widget. Files remain
 * the working store under §E9 ... they are written and not presented. The
 * widget is what the user sees."
 *
 * Three rules from the standard shape every builder below:
 *
 *   - **Copy discipline.** "Every `pre` carries a copy button and the button
 *     lifts RAW text from a stored attribute, never the highlighted DOM. Syntax
 *     colour must never reach the clipboard."
 *   - **Counts are computed, never typed.** "The number on the params line is
 *     the length of the exact string the copy button is holding." It is
 *     computed in the page from that same string, so it cannot drift from it.
 *   - **One accent per view.** The active dot is the only accent-filled element.
 */

import { escapeHtml, highlight } from "./highlight";
import { THEME_CSS } from "./theme";

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function page(options: {
  title: string;
  subtitle: string;
  body: string;
  script?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>${THEME_CSS}</style>
</head>
<body>
<main>
  <div class="page-head">
    <h1>${escapeHtml(options.title)}</h1>
    <div class="sub">${escapeHtml(options.subtitle)}</div>
  </div>
${options.body}
</main>
${options.script ? `<script>\n${options.script}\n</script>` : ""}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * Icons — inline rather than an icon font
 * ------------------------------------------------------------------ */

/**
 * §16A names the Tabler icons (`ti-chevron-left`, `ti-copy`, `ti-check`). A
 * deliverable opened from disk with no network cannot pull an icon font, so
 * the glyphs are inlined and the class names kept. The spec's hooks are intact;
 * only the delivery of the glyph differs.
 */
const ICONS = {
  chevronLeft: `<svg class="ti ti-chevron-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`,
  chevronRight: `<svg class="ti ti-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
  copy: `<svg class="ti ti-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  check: `<svg class="ti ti-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`,
};

/* ------------------------------------------------------------------ *
 * Shape 1 — the prompt widget (carousel)
 * ------------------------------------------------------------------ */

export interface PromptView {
  /** The exact string the copy button holds. The count is computed from it. */
  raw: string;
  /** Model string, duration where it applies, aspect, resolution, attachments. */
  params: string;
  register: "prose" | "json";
}

export interface BeatView {
  beatId: string;
  name: string;
  /** The line, rendered in curly quotes in its own panel. */
  scriptLine: string;
  /** §30B's six-slot row: `FUNCTION · subject · rig · energy · location`. */
  slots: string;
  /** `FACE` or `NOFACE`; rendered with its plain-English gloss, never bare. */
  faceState: "FACE" | "NOFACE" | null;
  extraBadges: string[];
  seed: PromptView | null;
  clip: PromptView | null;
}

const FACE_GLOSS: Record<string, string> = {
  FACE: "FACE · resolved in the seed",
  NOFACE: "NOFACE · nobody's in frame",
};

/**
 * A batch of beats is never delivered as stacked blocks: one widget holds the
 * whole batch and shows one beat at a time.
 */
export function carousel(id: string, title: string, beats: BeatView[]): string {
  const payload = beats.map((beat) => ({
    beatId: beat.beatId,
    name: beat.name,
    scriptLine: beat.scriptLine,
    slots: beat.slots,
    faceState: beat.faceState ? FACE_GLOSS[beat.faceState] : null,
    extraBadges: beat.extraBadges,
    views: {
      seed: beat.seed
        ? { raw: beat.seed.raw, html: highlight(beat.seed.raw, beat.seed.register), params: beat.seed.params }
        : null,
      clip: beat.clip
        ? { raw: beat.clip.raw, html: highlight(beat.clip.raw, beat.clip.register), params: beat.clip.params }
        : null,
    },
  }));

  return `<section class="card" id="${escapeHtml(id)}" data-carousel>
  <h2 class="sr-only">${escapeHtml(title)} — ${beats.length} beat${beats.length === 1 ? "" : "s"}: ${escapeHtml(beats.map((b) => b.beatId).join(", "))}</h2>
  <div class="nav-head">
    <button class="nav-btn prev" aria-label="Previous beat">${ICONS.chevronLeft}</button>
    <div class="dots" role="tablist"></div>
    <button class="nav-btn next" aria-label="Next beat">${ICONS.chevronRight}</button>
  </div>
  <div class="id-row">
    <span class="beat-id"></span>
    <span class="badges"></span>
  </div>
  <div class="script-panel">
    <div class="script-label">Script line</div>
    <div class="script-line"></div>
  </div>
  <div class="slots"></div>
  <div class="control-row">
    <div class="toggle"></div>
    <button class="copy-btn">${ICONS.copy}<span>Copy</span></button>
  </div>
  <div class="params"></div>
  <pre class="prompt"></pre>
  <script type="application/json" class="carousel-data">${jsonScript(payload)}</script>
</section>`;
}

/**
 * The carousel's behaviour.
 *
 * "Toggling never rebuilds the card. Seed / Clip and the dots re-render content
 * in place and rebind their handlers in the same pass. Replacing a control's
 * DOM with `innerHTML` drops its listeners and leaves a dead button."
 */
export const CAROUSEL_SCRIPT = `
(function () {
  var COPY = ${JSON.stringify(ICONS.copy)};
  var CHECK = ${JSON.stringify(ICONS.check)};

  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var beats = JSON.parse(root.querySelector(".carousel-data").textContent);
    if (!beats.length) return;

    var index = 0;
    var view = "seed";

    var dots = root.querySelector(".dots");
    var prev = root.querySelector(".prev");
    var next = root.querySelector(".next");
    var idEl = root.querySelector(".beat-id");
    var badgesEl = root.querySelector(".badges");
    var scriptEl = root.querySelector(".script-line");
    var slotsEl = root.querySelector(".slots");
    var toggleEl = root.querySelector(".toggle");
    var copyBtn = root.querySelector(".copy-btn");
    var paramsEl = root.querySelector(".params");
    var preEl = root.querySelector(".prompt");

    // Dots are built once and only their state changes, so their handlers are
    // bound once and never dropped.
    beats.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.className = "dot";
      dot.setAttribute("role", "button");
      dot.setAttribute("tabindex", "0");
      dot.setAttribute("aria-label", "Beat " + (i + 1) + " of " + beats.length);
      dot.addEventListener("click", function () { index = i; render(); });
      dots.appendChild(dot);
    });

    prev.addEventListener("click", function () { if (index > 0) { index--; render(); } });
    next.addEventListener("click", function () { if (index < beats.length - 1) { index++; render(); } });

    copyBtn.addEventListener("click", function () {
      // Raw text from the stored attribute — never the highlighted DOM.
      var raw = preEl.getAttribute("data-raw") || "";
      navigator.clipboard.writeText(raw).then(function () {
        copyBtn.innerHTML = CHECK + "<span>Copied</span>";
        setTimeout(function () { copyBtn.innerHTML = COPY + "<span>Copy</span>"; }, 1400);
      });
    });

    function slotMarkup(slots) {
      // The §30B function renders at weight 500; the remaining slots stay
      // secondary and dot-separated.
      var cut = slots.indexOf("·");
      if (cut === -1) return '<span class="fn">' + slots + "</span>";
      return '<span class="fn">' + slots.slice(0, cut).trim() + "</span> · " + slots.slice(cut + 1).trim();
    }

    function render() {
      var beat = beats[index];
      var available = ["seed", "clip"].filter(function (k) { return beat.views[k]; });
      if (available.indexOf(view) === -1) view = available[0];

      Array.prototype.forEach.call(dots.children, function (dot, i) {
        dot.className = i === index ? "dot active" : "dot";
      });
      // Disabled at the ends, never hidden, never wrapping to the far end.
      prev.disabled = index === 0;
      next.disabled = index === beats.length - 1;

      idEl.textContent = beat.beatId + (beat.name ? " · " + beat.name : "");

      var badges = [];
      if (beat.faceState) badges.push(beat.faceState);
      beat.extraBadges.forEach(function (b) { badges.push(b); });
      badges.push(index + 1 + " of " + beats.length);
      badgesEl.innerHTML = badges.map(function (b) {
        return '<span class="badge">' + b.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>";
      }).join("");

      scriptEl.textContent = beat.scriptLine ? "\\u201C" + beat.scriptLine + "\\u201D" : "";
      root.querySelector(".script-panel").hidden = !beat.scriptLine;
      slotsEl.innerHTML = slotMarkup(beat.slots || "");

      // The toggle is rebuilt only when the set of views changes, and its
      // handlers are rebound in the same pass.
      toggleEl.innerHTML = "";
      available.forEach(function (key) {
        var button = document.createElement("button");
        button.textContent = key === "seed" ? "Seed" : "Clip";
        button.className = key === view ? "active" : "";
        button.addEventListener("click", function () { view = key; render(); });
        toggleEl.appendChild(button);
      });
      toggleEl.hidden = available.length < 2;

      var current = beat.views[view];
      if (!current) { paramsEl.textContent = ""; preEl.textContent = ""; return; }

      // The count is a property of the string, not a claim about it.
      var count = current.raw.replace(/\\n/g, "").length;
      paramsEl.textContent = current.params + " · " + count.toLocaleString() + " chars";
      preEl.setAttribute("data-raw", current.raw);
      preEl.innerHTML = current.html;
    }

    render();
  });
})();
`;

/* ------------------------------------------------------------------ *
 * Shape 2 — the navigator
 * ------------------------------------------------------------------ */

export interface Metric { label: string; value: string | number }
export interface Tab { label: string; body: string }

/** "Metric cards across the top, then tab bar, then one panel at a time." */
export function navigator(id: string, title: string, metrics: Metric[], tabs: Tab[]): string {
  const metricMarkup = metrics.length
    ? `<div class="metrics">${metrics
        .map(
          (metric) =>
            `<div class="metric"><div class="n">${escapeHtml(String(metric.value))}</div><div class="k">${escapeHtml(metric.label)}</div></div>`,
        )
        .join("")}</div>`
    : "";

  const tabBar = tabs
    .map((tab, i) => `<button class="tab${i === 0 ? " active" : ""}" data-tab="${i}">${escapeHtml(tab.label)}</button>`)
    .join("");

  const panels = tabs
    .map((tab, i) => `<div class="panel" data-panel="${i}"${i === 0 ? "" : " hidden"}>${tab.body}</div>`)
    .join("");

  return `<section class="card" id="${escapeHtml(id)}" data-navigator>
  <h2 class="sr-only">${escapeHtml(title)}</h2>
  ${metricMarkup}
  <div class="tabs">${tabBar}</div>
  ${panels}
</section>`;
}

export const NAVIGATOR_SCRIPT = `
(function () {
  document.querySelectorAll("[data-navigator]").forEach(function (root) {
    var tabs = root.querySelectorAll(".tab");
    var panels = root.querySelectorAll(".panel");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-tab");
        tabs.forEach(function (t) { t.className = t === tab ? "tab active" : "tab"; });
        panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== target; });
      });
    });
  });
})();
`;

/* ------------------------------------------------------------------ *
 * Shape 3 — the spec card
 * ------------------------------------------------------------------ */

export interface SpecRow {
  label: string;
  /** Pre-escaped HTML. Use `text()` for plain values. */
  value: string;
}

/** "Titled card, labelled rows, values right. Never a wall of prose." */
export function specCard(title: string, rows: SpecRow[]): string {
  return `<section class="card">
  <h2 class="section" style="margin-top:0">${escapeHtml(title)}</h2>
  ${rows
    .map(
      (row) =>
        `<div class="spec-row"><div class="k">${escapeHtml(row.label)}</div><div class="v">${row.value}</div></div>`,
    )
    .join("\n  ")}
</section>`;
}

/* ------------------------------------------------------------------ *
 * Shape 4 — the ledger
 * ------------------------------------------------------------------ */

export interface LedgerColumn {
  label: string;
  /** Monospace and no-wrap — for ids, counts and statuses. */
  numeric?: boolean;
}

/** One row per item, with its badges. §16A routes locks, claims and wardrobe here. */
export function ledgerTable(columns: LedgerColumn[], rows: string[][]): string {
  return `<table class="ledger">
  <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
  <tbody>
${rows
  .map(
    (row) =>
      `    <tr>${row
        .map((cell, i) => `<td${columns[i]?.numeric ? ' class="num"' : ""}>${cell}</td>`)
        .join("")}</tr>`,
  )
  .join("\n")}
  </tbody>
</table>`;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Plain text into a cell or a spec value. */
export function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return `<span style="color:var(--text-muted)">—</span>`;
  return escapeHtml(String(value));
}

/** "Status is a badge, not a sentence." */
export function badge(value: string): string {
  return `<span class="badge">${escapeHtml(value)}</span>`;
}

export function copyBlock(raw: string, register: "prose" | "json" = "prose"): string {
  return `<pre class="prompt" data-raw="${escapeHtml(raw)}">${highlight(raw, register)}</pre>`;
}

/**
 * JSON inside a `<script>` block.
 *
 * `</script>` anywhere in a prompt would close the block early and break the
 * page, so the sequence is escaped. The parser reverses it transparently
 * because `\\u003c` is just `<` to `JSON.parse`.
 */
function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
