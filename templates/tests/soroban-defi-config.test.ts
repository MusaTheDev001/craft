import { describe, expect, it } from "vitest";
import config from "../soroban-defi/src/lib/config";

describe("soroban-defi config", () => {
  it("exposes the expected top-level keys", () => {
    expect(config).toHaveProperty("branding");
    expect(config).toHaveProperty("stellar");
    expect(config).toHaveProperty("contracts");
  });

  it("exposes contracts as an object", () => {
    expect(config.contracts).toBeTypeOf("object");
    expect(config.contracts).not.toBeNull();
    expect(Array.isArray(config.contracts)).toBe(false);
  });
});
