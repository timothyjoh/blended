import { describe, it, expect } from "vitest";
import {
  decideDegradation,
  walkthroughErrorsFileName,
  buildWalkthroughErrorsSidecar,
} from "./walkthrough-capture.mjs";

describe("decideDegradation", () => {
  it("real scenario with >=1 non-home capture is not degraded", () => {
    const r = decideDegradation({
      outcome: { fellBack: false, reason: null },
      chapters: ["01-foo", "02-bar"],
    });
    expect(r.degraded).toBe(false);
    expect(r.reason).toContain("2 non-home capture");
  });

  it("fallback — absent scenario echoes 'no walkthrough.mjs'", () => {
    const r = decideDegradation({
      outcome: { fellBack: true, reason: "no walkthrough.mjs" },
      chapters: ["00-home"],
    });
    expect(r).toEqual({ degraded: true, reason: "no walkthrough.mjs" });
  });

  it("fallback — scenario threw echoes the error message", () => {
    const r = decideDegradation({
      outcome: { fellBack: true, reason: "boom: something blew up" },
      chapters: ["00-home"],
    });
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe("boom: something blew up");
  });

  it("fallback — default export not a function echoes that message", () => {
    const r = decideDegradation({
      outcome: {
        fellBack: true,
        reason: "walkthrough.mjs default export is not a function",
      },
      chapters: ["00-home"],
    });
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe("walkthrough.mjs default export is not a function");
  });

  it("fallback with empty/whitespace reason gets a synthesized reason", () => {
    const r = decideDegradation({
      outcome: { fellBack: true, reason: "   " },
      chapters: [],
    });
    expect(r.degraded).toBe(true);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("ran but recorded no non-home captures is degraded", () => {
    const r = decideDegradation({
      outcome: { fellBack: false },
      chapters: ["00-home"],
    });
    expect(r.degraded).toBe(true);
    expect(r.reason).toContain("no non-home captures");
  });

  it("never throws on empty/missing inputs; returns well-formed degraded:true", () => {
    for (const input of [undefined, {}, { chapters: [] }, { outcome: undefined }]) {
      const r = decideDegradation(input);
      expect(r.degraded).toBe(true);
      expect(typeof r.reason).toBe("string");
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("tolerates a non-array chapters value without throwing", () => {
    const r = decideDegradation({ outcome: { fellBack: false }, chapters: "nope" });
    expect(r.degraded).toBe(true);
  });
});

describe("walkthroughErrorsFileName", () => {
  it("no phase → walkthrough-errors.json", () => {
    expect(walkthroughErrorsFileName(undefined)).toBe("walkthrough-errors.json");
  });

  it("phase 'before'/'after' → phase-aware name", () => {
    expect(walkthroughErrorsFileName("before")).toBe("walkthrough-before-errors.json");
    expect(walkthroughErrorsFileName("after")).toBe("walkthrough-after-errors.json");
  });

  it("whitespace or empty phase → no-phase name", () => {
    expect(walkthroughErrorsFileName("   ")).toBe("walkthrough-errors.json");
    expect(walkthroughErrorsFileName("")).toBe("walkthrough-errors.json");
  });
});

describe("buildWalkthroughErrorsSidecar", () => {
  it("passes through a well-formed payload", () => {
    expect(
      buildWalkthroughErrorsSidecar({
        degraded: true,
        reason: "no walkthrough.mjs",
        errors: ["no walkthrough.mjs"],
      }),
    ).toEqual({
      degraded: true,
      reason: "no walkthrough.mjs",
      errors: ["no walkthrough.mjs"],
    });
  });

  it("coerces missing fields to a well-formed default", () => {
    expect(buildWalkthroughErrorsSidecar()).toEqual({
      degraded: false,
      reason: "",
      errors: [],
    });
    expect(buildWalkthroughErrorsSidecar({})).toEqual({
      degraded: false,
      reason: "",
      errors: [],
    });
  });

  it("coerces non-boolean/non-array fields", () => {
    const r = buildWalkthroughErrorsSidecar({ degraded: "yes", reason: 5, errors: "x" });
    expect(r).toEqual({ degraded: false, reason: "", errors: [] });
  });
});
