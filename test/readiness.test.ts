import { test } from "node:test";
import assert from "node:assert/strict";

/*
 * These cover the env-vs-settings resolution that /setup depends on. The page
 * previously read only the database, so a provider configured by environment
 * variable — which the pipeline uses perfectly well — was reported as missing.
 */

const ORIGINAL = { ...process.env };

test("an API key in an environment variable resolves, with its source recorded", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";
  const { resolveConnection } = await import("../src/lib/connections");
  const resolved = await resolveConnection("anthropic");

  assert.ok(resolved, "an env var alone must be enough to resolve the provider");
  assert.equal(resolved.source, "env");
  assert.deepEqual(resolved.secret, { apiKey: "sk-ant-from-env" });
  process.env = { ...ORIGINAL };
});

test("ANTHROPIC_AUTH_TOKEN is accepted as well as ANTHROPIC_API_KEY", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_AUTH_TOKEN = "token-form";
  const { resolveConnection } = await import("../src/lib/connections");
  const resolved = await resolveConnection("anthropic");
  assert.equal((resolved?.secret as { apiKey: string }).apiKey, "token-form");
  process.env = { ...ORIGINAL };
});

test("ElevenLabs and HeyGen resolve from their own env vars", async () => {
  process.env.ELEVENLABS_API_KEY = "el-key";
  process.env.HEYGEN_API_KEY = "hg-key";
  const { resolveConnection } = await import("../src/lib/connections");

  assert.equal((await resolveConnection("elevenlabs"))?.source, "env");
  assert.equal((await resolveConnection("heygen"))?.source, "env");
  process.env = { ...ORIGINAL };
});

test("a provider with nothing configured resolves to null, not a broken object", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const { resolveConnection } = await import("../src/lib/connections");
  assert.equal(await resolveConnection("anthropic"), null);
  process.env = { ...ORIGINAL };
});

test("the env var names are exactly what the docs tell people to set", async () => {
  // A mismatch here is invisible: the key is present, spelled slightly wrong,
  // and the app reports the provider as not connected.
  const { PROVIDER_SPEC } = await import("../src/lib/connections");
  assert.equal(PROVIDER_SPEC.anthropic.envFallback[0], "ANTHROPIC_API_KEY");
  assert.equal(PROVIDER_SPEC.elevenlabs.envFallback[0], "ELEVENLABS_API_KEY");
  assert.equal(PROVIDER_SPEC.heygen.envFallback[0], "HEYGEN_API_KEY");
  assert.equal(PROVIDER_SPEC.higgsfield.envFallback[0], "HIGGSFIELD_MCP_URL");
});
