/**
 * Model arsenal enforcement (§18A, §44.19, §44.47).
 *
 * "Three models exist for this pipeline and no others." The rules here are not
 * defaults to be overridden — §44.47 makes a job that logs a retired model a
 * *failed generation*, "discarded, re-run in the platform interface, never
 * accepted because the frame happened to look good."
 *
 * Two catalogue traps, read off the per-model schema (§5): `quality` defaults
 * to `low` and `resolution` defaults to `1k`, and GPT Image's `variant`
 * defaults to the retired `flare`. None of the three is ever omitted.
 */

export const ARSENAL = ["nano_banana_pro", "nano_banana_2", "gpt_image_2_5"] as const;
export type ArsenalModel = (typeof ARSENAL)[number];

export const RETIRED_MODELS = ["nano_banana_flash", "flare", "gpt_image_2_5_flare"] as const;

export class RetiredModelError extends Error {
  constructor(public readonly logged: string) {
    super(
      `Job logged retired model "${logged}". §44.47: this is a failed generation — discarded, never entered in the ledger as delivered.`,
    );
    this.name = "RetiredModelError";
  }
}

export interface ImageCallParams {
  model: ArsenalModel;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  quality: string;
  variant?: string;
  medias?: Array<{ role: string; value: string }>;
  /**
   * Omitting this makes the server return an `unlim_choice` question and
   * submit nothing — a silent no-op in an automated pipeline. It is always
   * explicit here.
   */
  use_unlim: boolean;
}

export interface BuildCallOptions {
  model: ArsenalModel;
  prompt: string;
  /** §44.38: 9:16 unless the Build Sheet overrides. */
  aspectRatio?: string;
  /** §44.19: 2k on every beat type. `xhigh` quality on pack shots. */
  quality?: "high" | "xhigh" | "max";
  medias?: Array<{ role: string; value: string }>;
  useUnlim?: boolean;
}

/**
 * Assemble a call with every trap closed.
 *
 * The role a reference image takes differs per model (§4): `gpt_image_2_5`
 * accepts them under `image_references`, `gpt_image_2` under `image`. Callers
 * pass the semantic role and it is mapped here rather than at each call site.
 */
export function buildImageCall(options: BuildCallOptions): ImageCallParams {
  const { model, prompt, aspectRatio = "9:16", quality = "high", medias = [], useUnlim = false } = options;

  if (!ARSENAL.includes(model)) {
    throw new Error(`"${model}" is not in the arsenal (${ARSENAL.join(", ")}). §44.19.`);
  }

  const params: ImageCallParams = {
    model,
    prompt,
    aspect_ratio: aspectRatio,
    // Never omitted: the catalogue default is 1k and a soft frame is a
    // parameter check before it is a prompt check.
    resolution: "2k",
    quality,
    use_unlim: useUnlim,
  };

  if (model === "gpt_image_2_5") {
    // "Because Flare is the catalogue default, `variant: sunburst` is passed
    // explicitly on every call without exception; an omitted variant silently
    // runs the retired one."
    params.variant = "sunburst";
  }

  if (medias.length) {
    params.medias = medias.map((m) => ({ ...m, role: mapMediaRole(model, m.role) }));
  }

  return params;
}

function mapMediaRole(model: ArsenalModel, role: string): string {
  // §4: gpt_image_2_5 takes reference images under `image_references`;
  // the Nano Banana models take them under `image`.
  if (role === "reference") return model === "gpt_image_2_5" ? "image_references" : "image";
  return role;
}

/**
 * §44.47 — "read the logged model on every completed job. The string passed is
 * not evidence of the model run."
 */
export function verifyLoggedModel(passed: string, logged: string | null | undefined): void {
  if (!logged) return; // Nothing logged is not evidence of a retired model.

  const normalised = logged.toLowerCase();
  for (const retired of RETIRED_MODELS) {
    if (normalised.includes(retired)) throw new RetiredModelError(logged);
  }

  // An alias mismatch is its own failure class (E2 ALIAS_MISMATCH): the job is
  // resubmitted once with an explicit string before a human sees it.
  if (!normalised.includes(passed.toLowerCase())) {
    throw new AliasMismatchError(passed, logged);
  }
}

export class AliasMismatchError extends Error {
  constructor(public readonly passed: string, public readonly logged: string) {
    super(`Passed model "${passed}" but the job logged "${logged}" (E2 ALIAS_MISMATCH).`);
    this.name = "AliasMismatchError";
  }
}

/**
 * §18A Part 3 — the Mode 1 default lock, as routed on THIS connector.
 *
 * Two measured facts shape this table, both recorded in docs/measurements.md:
 *
 *   M1/M4 — `nano_banana_pro` does not survive the connector. Two submissions,
 *   different prompts, different batches, both completed logging
 *   `nano_banana_2`. §44.47 makes the logged model the evidence, so every
 *   route to `nano_banana_pro` fails verifyLoggedModel, burns its
 *   ALIAS_MISMATCH retry and queues for a human. It is unusable here, not
 *   merely unreliable.
 *
 *   M4 — `gpt_image_2_5` Sunburst verifies cleanly (passed model is the logged
 *   model, and the job's params confirm `sunburst`), and its side-by-side held
 *   both halves of §18A's bar: the wordmark and the §22A/§22T register.
 *
 * So the three classes §18A puts on `nano_banana_pro` move to Sunburst. That
 * is a choice the standard already sanctions rather than a deviation: Part 3
 * lists every one of them as "`nano_banana_pro` · Sunburst", and §19 measured
 * Sunburst as returning "the best close-up texture of any generation in the
 * pipeline", which is the evidence that matters for the two face classes.
 *
 * The result is that NOTHING routes to `nano_banana_pro` here. That is a
 * property of this connector, not of the model — see the note on mechanism
 * beats below for the one place GPT Image must not go.
 */
export const DEFAULT_ROUTES: Record<string, ArsenalModel> = {
  // §19, measured: identity and grid held across five panels, best close-up
  // texture in the pipeline.
  avatar_sheet: "gpt_image_2_5",

  // M4: the side-by-side §18A asks for, both halves clear.
  readable_wordmark: "gpt_image_2_5",

  // §18A Part 3 lists both as "nano_banana_pro · Sunburst". Sunburst is the
  // half of that pair which verifies here, and §19's measured close-up texture
  // is the supporting evidence for a face class.
  candid_face_seed: "gpt_image_2_5",
  talking_head_seed: "gpt_image_2_5",

  volume_broll: "nano_banana_2",

  // §18A: "Mechanism A–C: nano_banana_2 · nano_banana_pro only — classifier
  // threshold." §4 is explicit that OpenAI's classifiers are stricter than
  // Nano Banana's, so GPT Image is NOT an option here however well it scores
  // elsewhere. With nano_banana_pro unusable on this connector, nano_banana_2
  // is the only remaining route.
  mechanism: "nano_banana_2",

  // Plates carry no type and no face, so §18A's closest listed class is
  // "Volume B-roll, no type" (see M1).
  property_plate: "nano_banana_2",
  location_plate: "nano_banana_2",
};

/**
 * Guard against a route regressing onto the aliased model.
 *
 * Exported so a test can assert it rather than leaving the invariant to a
 * comment. If the connector's routing is ever fixed, delete this and the
 * measurement note together — not one without the other.
 */
export const UNUSABLE_ON_THIS_CONNECTOR: ArsenalModel[] = ["nano_banana_pro"];
