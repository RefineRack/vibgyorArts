import { describe, expect, it } from "vitest";
import { CUT_COLOUR, CREASE_COLOUR, dielinePreview, dielinePreviewSvg } from "@/lib/dieline-preview";
import { gableScene, tuckEndScene } from "@/lib/demo-boxes";
import type { DielineScene } from "@/lib/dieline-types";

const twoPanel: DielineScene = {
  schemaVersion: 1,
  modelId: "000001",
  unit: "mm",
  thickness: 0.4,
  faces: [
    { name: "Front", path: "M0 0H80V50H0Z", holes: [] },
    { name: "Left", path: "M-30 0H0V50H-30Z", holes: [] },
  ],
  hinges: [{ name: "h1", parent: "Front", child: "Left", pivot: { x: 0, y: 0, z: 0 } }],
  stages: [[]],
  orientation: { x: 0, y: 0, z: 1 },
  support: { folding: true, material: "blank", scope: "single-layer-hinge-rotation", productionValidated: false },
};

describe("dielinePreview", () => {
  it("builds cut paths and a crease along the shared edge", () => {
    const preview = dielinePreview(twoPanel);
    expect(preview).not.toBeNull();
    const cuts = preview!.paths.filter((path) => path.kind === "cut");
    const creases = preview!.paths.filter((path) => path.kind === "crease");
    expect(cuts).toHaveLength(2);
    expect(cuts.map((path) => path.d)).toEqual(["M0 0H80V50H0Z", "M-30 0H0V50H-30Z"]);
    expect(creases).toHaveLength(1);
    expect(creases[0].d).toBe("M0 0L0 50");
    expect(preview!.viewBox).toBe("-34 -4 118 58");
    expect(preview!.widthMm).toBe(110);
    expect(preview!.heightMm).toBe(50);
  });

  it("draws handle holes as cut paths", () => {
    const withHole: DielineScene = {
      ...twoPanel,
      faces: [{ name: "Front", path: "M0 0H80V50H0Z", holes: ["M10 10H20V20H10Z"] }, twoPanel.faces[1]],
    };
    const cuts = dielinePreview(withHole)!.paths.filter((path) => path.kind === "cut");
    expect(cuts.some((path) => path.d === "M10 10H20V20H10Z")).toBe(true);
  });

  it("falls back to the edge nearest the pivot when outlines do not share a segment", () => {
    const offset: DielineScene = {
      ...twoPanel,
      faces: [
        { name: "Front", path: "M0 0H80V50H0Z", holes: [] },
        { name: "Left", path: "M-31 0H-1V50H-31Z", holes: [] },
      ],
    };
    const creases = dielinePreview(offset)!.paths.filter((path) => path.kind === "crease");
    expect(creases).toHaveLength(1);
    expect(creases[0].d).toBe("M-1 0L-1 50");
  });

  it("writes an SVG with blue cuts and red creases", () => {
    const svg = dielinePreviewSvg(twoPanel);
    expect(svg).toContain(`stroke="${CUT_COLOUR}"`);
    expect(svg).toContain(`stroke="${CREASE_COLOUR}"`);
    expect(svg).toContain('viewBox="-34 -4 118 58"');
    expect(svg).toContain("stroke-dasharray");
  });

  it("produces a preview for the fixture tuck-end and gable scenes", () => {
    const tuck = dielinePreview(tuckEndScene())!;
    expect(tuck.paths.filter((path) => path.kind === "cut").length).toBeGreaterThanOrEqual(7);
    expect(tuck.paths.filter((path) => path.kind === "crease").length).toBeGreaterThanOrEqual(5);
    const gable = dielinePreview(gableScene())!;
    expect(gable.paths.some((path) => path.kind === "cut" && path.d.includes("a24"))).toBe(true);
    expect(gable.paths.filter((path) => path.kind === "crease").length).toBeGreaterThanOrEqual(5);
  });
});
