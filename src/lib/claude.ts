/**
 * The model layer.
 *
 * Every process here is one structured call against a section-sliced view of
 * the Standards. Three things are deliberate:
 *
 *   - The system prompt is assembled from a *declared* section list, not the
 *     whole 679KB document. A model handed every rule in the corpus applies
 *     the wrong ones, and the token bill is the smaller problem.
 *   - The standards prefix carries a 1-hour cache breakpoint. It is identical
 *     across every run of a given process, so after the first call it is read
 *     at ~0.1x. Build-specific content goes after the breakpoint, never before.
 *   - Output is schema-validated. §45 requires visible numbers and marked
 *     status on every deliverable; a free-text answer cannot be checked.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zodOutputFormat helper is written against Zod v4, exposed by
// zod@3.25+ on the `zod/v4` subpath. Schemas must come from the same subpath
// or the inferred parsed_output type does not line up.
import type * as z from "zod/v4";
import { assembleContext, renderStringLibrary, resolveReferencedStrings, loadStandards } from "@/standards/registry";

export const MODEL = "claude-opus-5";

declare global {
  // eslint-disable-next-line no-var
  var __anthropic: Anthropic | undefined;
}

export const anthropic = globalThis.__anthropic ?? new Anthropic();
if (process.env.NODE_ENV !== "production") globalThis.__anthropic = anthropic;

/**
 * The role preamble. §1 verbatim in substance: the deliverable is the artefact,
 * never a description of one, and §45's working rules govern tone.
 *
 * Kept as a frozen constant because it is the first cache block — any
 * interpolation here would invalidate the standards prefix behind it.
 */
const ROLE_PREAMBLE = `You are a professional AI prompt engineer specializing in generative media for ads, VSLs, B-roll, talking heads, product videos, avatar consistency, and AI video production workflows.

You are operating inside an automated build pipeline. You are executing one numbered step of the build order defined in the Standards excerpt that follows. Rules that govern you:

- The Standards excerpt below is authoritative. Where it states a rule, follow it exactly. Do not import craft knowledge that contradicts it.
- Order of authority, highest first: reference images, Product Sheet spec, locked visual and performance standards, script, Build Sheet, locked defaults. A lower layer never silently overrides a higher one.
- Where a script line contradicts a product spec or a visual standard, flag the collision. Never rewrite the line to resolve it.
- Mark every claim you make about generation behaviour as measured or unverified. Never let a derived claim sit unmarked beside a measured one.
- Take a position. Where there is a creative choice, choose and state why. Do not produce neutral option lists.
- Show the number. Every count the standards impose is reported as a number, not an impression.
- Never invent a measurement. Where a numeric field is supplied to you by an instrument, use it exactly; where it is not supplied, say so rather than estimating.`;

export interface StandardsCallOptions<T> {
  /** Section ids to assemble, e.g. ["42", "3", "30B"]. Order is irrelevant. */
  sections: string[];
  /** Schema the response is validated against. */
  schema: z.ZodType<T>;
  /** The build-specific instruction and data. Goes after the cache breakpoint. */
  content: Anthropic.ContentBlockParam[];
  /** Extra task framing appended to the role preamble, before the standards. */
  task: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Called as output streams, for surfacing progress on a long-running step. */
  onProgress?: (event: { type: "thinking" | "text"; chars: number }) => void;
}

export interface StandardsCallResult<T> {
  output: T;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  /** The section ids actually assembled, recorded on the process row. */
  sections: string[];
  standardsVersion: string;
}

/**
 * Run one structured call against a slice of the Standards.
 *
 * Streaming is used unconditionally. These outputs run long — an absorption
 * sheet carries a full shot table and a reference phrase inventory — and a
 * non-streaming request at that size risks an HTTP timeout rather than a
 * model failure, which is the worst kind of error to debug.
 */
export async function callWithStandards<T>(
  options: StandardsCallOptions<T>,
): Promise<StandardsCallResult<T>> {
  const { sections, schema, content, task, maxTokens = 32000, effort = "high", onProgress } = options;

  const standards = assembleContext(sections);
  const referenced = resolveReferencedStrings(standards);
  const library = renderStringLibrary(referenced);

  const standardsBlock = [
    "The following is the authoritative excerpt of the Global Standards for this step.",
    "",
    standards,
    library ? `\n\n---\n\n# Referenced strings from Appendix A\n\nThese are locked. Where a section names one of these IDs, this is its exact text.\n\n${library}` : "",
  ].join("\n");

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: zodOutputFormat(schema),
    },
    system: [
      // Block 1: frozen. Identical on every call in the app.
      { type: "text", text: `${ROLE_PREAMBLE}\n\n---\n\n## This step\n\n${task}` },
      // Block 2: the standards slice. Identical per process kind, so it caches
      // across every build. 1h TTL because builds arrive in bursts, not
      // within the 5-minute default window.
      { type: "text", text: standardsBlock, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [{ role: "user", content }],
  });

  if (onProgress) {
    let thinkingChars = 0;
    let textChars = 0;
    stream.on("streamEvent", (event) => {
      if (event.type !== "content_block_delta") return;
      if (event.delta.type === "thinking_delta") {
        thinkingChars += event.delta.thinking.length;
        onProgress({ type: "thinking", chars: thinkingChars });
      } else if (event.delta.type === "text_delta") {
        textChars += event.delta.text.length;
        onProgress({ type: "text", chars: textChars });
      }
    });
  }

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new ModelRefusalError(message.stop_details);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      `Response hit max_tokens (${maxTokens}) and is truncated. Raise maxTokens or split the step — do not accept a partial artefact.`,
    );
  }

  // parsed_output is populated by the SDK when output_config.format is a
  // parseable format. It is null when parsing failed, which is a hard error:
  // a half-parsed artefact downstream is worse than a failed step.
  const parsed = message.parsed_output as T | null | undefined;
  if (parsed == null) {
    const text = message.content.find((b) => b.type === "text");
    throw new Error(
      `Model output did not parse against the schema. First 400 chars: ${
        text && text.type === "text" ? text.text.slice(0, 400) : "<no text block>"
      }`,
    );
  }

  return {
    output: parsed,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    sections,
    standardsVersion: loadStandards().version,
  };
}

export class ModelRefusalError extends Error {
  constructor(public readonly details: unknown) {
    super("The model declined this request. Check stop_details for the category.");
    this.name = "ModelRefusalError";
  }
}
