/**
 * Turning a technical failure into an instruction.
 *
 * Every error in this pipeline surfaces to someone who did not write it. A
 * message like `ConnectionMissingError` or `401: Unauthorized` is accurate and
 * useless: it says what broke, not what to do. These map the failures we can
 * actually recognise onto a plain sentence plus a fix, and pass anything
 * unrecognised through unchanged rather than inventing an explanation for it.
 */

export interface FriendlyError {
  /** One sentence, no jargon. */
  summary: string;
  /** What to do about it. Null where we genuinely do not know. */
  fix: string | null;
  href: string | null;
  /** The original, kept for anyone who wants it. */
  technical: string;
}

interface Rule {
  match: RegExp;
  summary: string;
  fix: string | null;
  href?: string | null;
}

const RULES: Rule[] = [
  // --- Missing or broken connections
  {
    match: /No Anthropic connection is configured|requireConnection.*anthropic|ConnectionMissingError.*anthropic/i,
    summary: "Anthropic is not connected, and every step needs it.",
    fix: "Open Settings and connect Anthropic with an API key from console.anthropic.com.",
    href: "/settings",
  },
  {
    match: /No Higgsfield connection is configured|HIGGSFIELD_MCP_URL is not set/i,
    summary: "Higgsfield is not connected, so images cannot be generated.",
    fix: "Open Settings and connect Higgsfield.",
    href: "/settings",
  },
  {
    match: /No ElevenLabs connection|ConnectionMissingError.*elevenlabs/i,
    summary: "ElevenLabs is not connected, so the voice cannot be cloned.",
    fix: "Open Settings and connect ElevenLabs.",
    href: "/settings",
  },
  {
    match: /No HeyGen connection|ConnectionMissingError.*heygen/i,
    summary: "HeyGen is not connected, so avatar videos cannot be rendered.",
    fix: "Open Settings and connect HeyGen.",
    href: "/settings",
  },

  // --- Credentials
  {
    match: /\b401\b|Unauthorized|invalid[_ ]api[_ ]key|authentication_error/i,
    summary: "A provider rejected the API key.",
    fix: "The key is wrong, expired or revoked. Create a fresh one and re-save it in Settings.",
    href: "/settings",
  },
  {
    match: /\b403\b|Forbidden|permission/i,
    summary: "The API key was accepted but is not allowed to do this.",
    fix: "The key lacks permission, or the account does not have this feature enabled. Check the provider's dashboard.",
    href: "/settings",
  },
  {
    match: /credit balance|insufficient|quota|billing|payment required|\b402\b/i,
    summary: "The provider account has run out of credit.",
    fix: "Top up the account with that provider, then run the step again.",
    href: null,
  },
  {
    match: /\b429\b|rate limit|too many requests/i,
    summary: "The provider is rate-limiting us.",
    fix: "Wait a few minutes and run it again. Nothing is broken.",
    href: null,
  },

  // --- Setup
  {
    match: /SETTINGS_ENCRYPTION_KEY is not set/i,
    summary: "The app has no encryption key, so it will not save any credentials.",
    fix: "Set SETTINGS_ENCRYPTION_KEY on both the web and worker services, then redeploy.",
    href: null,
  },
  {
    match: /Required instrument "(\w+)" is not on PATH|MissingInstrumentError/i,
    summary: "A video tool is missing from the worker.",
    fix: "The worker image is missing ffmpeg, tesseract or Whisper. Rebuild the worker from docker/worker.Dockerfile.",
    href: null,
  },
  {
    match: /ECONNREFUSED|ENOTFOUND|getaddrinfo|connect ETIMEDOUT/i,
    summary: "Could not reach a service over the network.",
    fix: "Either the address is wrong or outbound internet is blocked from the worker. Check the connection's URL in Settings.",
    href: "/settings",
  },
  {
    match: /no space left on device|ENOSPC/i,
    summary: "The worker has run out of disk space.",
    fix: "Clear old builds, or give the worker a larger disk.",
    href: null,
  },

  // --- Pipeline preconditions
  {
    match: /No phrase inventory|run step 2 first/i,
    summary: "This step needs step 2 to have run first.",
    fix: "Run step 2 on this build, then try again.",
    href: null,
  },
  {
    match: /No inspo video in this build|No script in this build|No source clips/i,
    summary: "Something is missing from this build's uploads.",
    fix: "Go back to the build and upload the missing file.",
    href: null,
  },
  {
    match: /has no audio stream/i,
    summary: "A video clip has no sound, so it cannot be used to clone a voice.",
    fix: "Re-generate or re-upload that clip with audio enabled.",
    href: null,
  },
  {
    match: /logged retired model|RetiredModelError/i,
    summary: "The provider ran a model we do not accept, so the result was discarded.",
    fix: "Nothing to do — this is recorded and the step will be retried automatically.",
    href: null,
  },
  {
    match: /over the .* ceiling|cannot be split on a sentence boundary/i,
    summary: "A single sentence in the script is too long to process.",
    fix: "Shorten that sentence in the script and run the step again.",
    href: null,
  },
];

export function friendly(error: unknown): FriendlyError {
  const technical = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  for (const rule of RULES) {
    if (rule.match.test(technical)) {
      return { summary: rule.summary, fix: rule.fix, href: rule.href ?? null, technical };
    }
  }

  // Unrecognised. Say so rather than guessing at a cause.
  return {
    summary: "Something went wrong that we do not have a specific explanation for.",
    fix: null,
    href: null,
    technical,
  };
}
