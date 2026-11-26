import { describe, expect, it } from "vitest";
import { parseDieline, pacdoraSceneToDraftSvg } from "@/lib/artwork";
import type { DielineScene } from "@/lib/dieline-types";

const scene: DielineScene = {
  schemaVersion: 1,
  modelId: "100010",
  unit: "mm",
  thickness: 0.4,
  faces: [
    { name: "Front", path: "M0 0H70V120H0Z", holes: [] },
    { name: "Left side", path: "M70 0H100V120H70Z", holes: [] },
    { name: "Glue flap", path: "M-15 0H0V120H-15Z", holes: [] },
  ],
  hinges: [
    { name: "h1", parent: "Front", child: "Left side", pivot: { x: 70, y: 0, z: 0 } },
    { name: "h2", parent: "Front", child: "Glue flap", pivot: { x: 0, y: 0, z: 0 } },
  ],
  stages: [[]],
  orientation: { x: 0, y: 0, z: 1 },
  support: { folding: true, material: "blank", scope: "single-layer-hinge-rotation", productionValidated: false },
};

describe("pacdoraSceneToDraftSvg", () => {
  it("turns a studio dieline into a draft canonical SVG that passes validation", () => {
    const svg = pacdoraSceneToDraftSvg(scene, { sku: "PD-100010", name: "Draft" });
    const parsed = parseDieline(svg, { defaultBleedMm: 3, defaultSafeMm: 3 });
    expect(parsed.errors).toEqual([]);
    expect(parsed.box).toMatchObject({ sku: "PD-100010", draft: true });
    expect(parsed.warnings.map((issue) => issue.code)).toContain("draft");
    expect(parsed.boardWidthMm).toBe(121);
    const byName = Object.fromEntries(parsed.panels.map((panel) => [panel.name, panel]));
    expect(byName.front).toMatchObject({ role: "front", widthMm: 70, heightMm: 120, xMm: 18, yMm: 3 });
    expect(byName.left_side).toMatchObject({ role: "left" });
    expect(byName.glue_flap).toMatchObject({ role: "glue_flap", unprinted: true });
    expect(byName.front.neighbours).toEqual([
      { panelName: "left_side", edge: "right" },
      { panelName: "glue_flap", edge: "left" },
    ]);
  });
});
