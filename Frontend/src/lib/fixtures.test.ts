import { describe, expect, it } from "vitest";
import { centralWindowUtc } from "./fixtures";

describe("demo Central Time windows", () => {
  it("uses a 23-hour spring transition and a 25-hour fall transition", () => {
    const spring = centralWindowUtc("2026-03-08");
    const fall = centralWindowUtc("2026-11-01");
    expect((Date.parse(spring.active_end_utc) - Date.parse(spring.active_start_utc)) / 3_600_000).toBe(23);
    expect((Date.parse(fall.active_end_utc) - Date.parse(fall.active_start_utc)) / 3_600_000).toBe(25);
  });
});
