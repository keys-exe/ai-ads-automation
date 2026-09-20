import { test } from "node:test";
import assert from "node:assert/strict";

// Set before importing: the module reads the key at call time, but this keeps
// the test independent of whatever the ambient environment carries.
process.env.SETTINGS_ENCRYPTION_KEY = "Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4MA==";

const { seal, open, hint, MissingEncryptionKeyError } = await import("../src/lib/crypto");

test("a sealed secret round-trips", () => {
  const secret = JSON.stringify({ apiKey: "sk-ant-test-0123456789" });
  assert.equal(open(seal(secret)), secret);
});

test("every seal uses a fresh nonce", () => {
  // A reused GCM nonce under one key leaks the plaintext relationship.
  const a = seal("same input");
  const b = seal("same input");
  assert.notDeepEqual(a.iv, b.iv);
  assert.notDeepEqual(a.cipher, b.cipher);
});

test("a tampered ciphertext fails to decrypt rather than returning garbage", () => {
  const sealed = seal("sensitive");
  sealed.cipher[0] ^= 0xff;
  assert.throws(() => open(sealed));
});

test("a tampered auth tag fails to decrypt", () => {
  const sealed = seal("sensitive");
  sealed.tag[0] ^= 0xff;
  assert.throws(() => open(sealed));
});

test("a wrong key fails to decrypt", () => {
  const sealed = seal("sensitive");
  const original = process.env.SETTINGS_ENCRYPTION_KEY;
  process.env.SETTINGS_ENCRYPTION_KEY = "a-completely-different-key";
  try {
    assert.throws(() => open(sealed));
  } finally {
    process.env.SETTINGS_ENCRYPTION_KEY = original;
  }
});

test("the hint exposes only the last four characters", () => {
  assert.equal(hint("sk-ant-api03-SECRETVALUE-abcd"), "••••abcd");
  assert.equal(hint("xy"), "••••", "a short secret exposes nothing at all");
});

test("a missing key throws instead of falling back to plaintext", () => {
  const original = process.env.SETTINGS_ENCRYPTION_KEY;
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  try {
    assert.throws(() => seal("x"), MissingEncryptionKeyError);
  } finally {
    process.env.SETTINGS_ENCRYPTION_KEY = original;
  }
});

test("a non-base64 passphrase is accepted by hashing to 32 bytes", () => {
  const original = process.env.SETTINGS_ENCRYPTION_KEY;
  process.env.SETTINGS_ENCRYPTION_KEY = "a short human passphrase";
  try {
    assert.equal(open(seal("round trip")), "round trip");
  } finally {
    process.env.SETTINGS_ENCRYPTION_KEY = original;
  }
});
