import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, rehashIfNeeded, verifyPassword } from "./password";

describe("hashPassword / verifyPassword (Argon2id)", () => {
  it("hashes a password into a real Argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies a correct password against its own real Argon2 hash", async () => {
    const password = "S3curePassw0rd!";
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against a real Argon2 hash", async () => {
    const hash = await hashPassword("the-real-password");
    await expect(verifyPassword("a-wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (real random salt), yet both verify", async () => {
    const password = "same-password-twice";
    const [hashA, hashB] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(hashA).not.toBe(hashB);
    await expect(verifyPassword(password, hashA)).resolves.toBe(true);
    await expect(verifyPassword(password, hashB)).resolves.toBe(true);
  });
});

describe("verifyPassword (legacy bcrypt)", () => {
  it("verifies a correct password against a real pre-existing bcrypt hash", async () => {
    const password = "legacy-bcrypt-password";
    const bcryptHash = await bcrypt.hash(password, 10);
    await expect(verifyPassword(password, bcryptHash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against a real bcrypt hash", async () => {
    const bcryptHash = await bcrypt.hash("original-password", 10);
    await expect(verifyPassword("wrong-password", bcryptHash)).resolves.toBe(false);
  });

  it("returns false (never a fabricated match) for an unrecognized hash format", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash-format")).resolves.toBe(false);
  });
});

describe("needsRehash", () => {
  it("reports true for a legacy bcrypt hash", async () => {
    const bcryptHash = await bcrypt.hash("password", 10);
    expect(needsRehash(bcryptHash)).toBe(true);
  });

  it("reports false for an already-Argon2 hash", async () => {
    const argonHash = await hashPassword("password");
    expect(needsRehash(argonHash)).toBe(false);
  });
});

describe("rehashIfNeeded", () => {
  it("returns a new Argon2 hash for a verified bcrypt password", async () => {
    const password = "migrate-me";
    const bcryptHash = await bcrypt.hash(password, 10);
    const newHash = await rehashIfNeeded(password, bcryptHash);
    expect(newHash).not.toBeNull();
    expect(newHash!.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(password, newHash!)).resolves.toBe(true);
  });

  it("returns null when the hash is already Argon2 (nothing to migrate)", async () => {
    const argonHash = await hashPassword("already-modern");
    await expect(rehashIfNeeded("already-modern", argonHash)).resolves.toBeNull();
  });
});
