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

/** §18A Part 3 — the Mode 1 default lock, used where step 2 left a class unrouted. */
export const DEFAULT_ROUTES: Record<string, ArsenalModel> = {
  // "Routed — measured. Two sheets, two face types, identity and grid held,
  // best close-up texture in the pipeline."
  avatar_sheet: "gpt_image_2_5",
  readable_wordmark: "nano_banana_pro",
  candid_face_seed: "nano_banana_pro",
  talking_head_seed: "nano_banana_pro",
  volume_broll: "nano_banana_2",
  // "Mechanism A–C: nano_banana_2 · nano_banana_pro only — classifier threshold."
  mechanism: "nano_banana_2",
  // Plates carry no type and no face, so §18A's closest listed class is
  // "Volume B-roll, no type → nano_banana_2" rather than any of the three
  // classes it routes to nano_banana_pro (readable wordmark, candid face
  // seeds, talking-head seeds).
  //
  // This also sidesteps §5's unresolved alias failure, reproduced on this
  // pipeline's first real call: a job submitted as nano_banana_pro completed
  // logging nano_banana_2 (job 4f176a90, 20 Sep 2026). Routing a plate to
  // nano_banana_pro through the connector therefore fails verifyLoggedModel
  // every time, burns its ALIAS_MISMATCH retry and queues for a human — for a
  // beat class the standard never asked to be on pro.
  property_plate: "nano_banana_2",
  location_plate: "nano_banana_2",
};
