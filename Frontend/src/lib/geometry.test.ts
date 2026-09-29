import { describe, expect, it } from "vitest";
import { todayPuzzle } from "./fixtures";
import { dequantize, forceCost, isLegalPlacement, makePlacement, placementPoint, quantize } from "./geometry";

describe("canonical placement", () => {
  const puzzle = todayPuzzle();
  it("round trips through a 1/1024 unit grid", () => {
    const original = 123.456789;
    expect(Math.abs(dequantize(quantize(original)) - original)).toBeLessThan(0.5 / 1024);
  });
  it("permits overlaps with walls and terrain while enforcing the entire active shape boundary", () => {
    expect(isLegalPlacement(puzzle, makePlacement("a", { x: 305, y: 295 }))).toBe(true);
    expect(isLegalPlacement(puzzle, makePlacement("a", { x: 40, y: 200 }))).toBe(false);
    expect(isLegalPlacement(puzzle, makePlacement("a", { x: 900, y: 200 }))).toBe(true);
  });
  it("counts every placed tile, even if the ball never touches it", () => {
    const placements = [makePlacement("a", { x: 200, y: 200 }), makePlacement("d", { x: 800, y: 450 })];
    expect(forceCost(puzzle, placements)).toBe(5000);
    expect(placementPoint(placements[0])).toEqual({ x: 200, y: 200 });
  });
});
