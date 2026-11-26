import { describe, expect, it } from "vitest";
import {
  DielineValidationError,
  MemoryObjectStorage,
  StorageArtworkRepository,
  boardBleedRect,
  boardSafeRect,
  getText,
  parseDieline,
  registerDieline,
} from "@/lib/artwork";
import { mutate, testConfig, tuckEndSvg } from "./helpers";

const defaults = { defaultBleedMm: 3, defaultSafeMm: 3 };
const codes = (svg: string) => parseDieline(svg, defaults).errors.map((issue) => issue.code);

describe("parseDieline", () => {
  it("reads board size and panels in millimetres from the fixture", () => {
    const parsed = parseDieline(tuckEndSvg(), defaults);
    expect(parsed.errors).toEqual([]);
    expect(parsed.boardWidthMm).toBe(130);
    expect(parsed.boardHeightMm).toBe(180);
    expect(parsed.box).toMatchObject({ sku: "VA-FIXTURE-TE-70x30x120", style: "tuck-end", finishedDepthMm: 30 });
    const front = parsed.panels.find((panel) => panel.name === "front");
    expect(front).toMatchObject({
      role: "front",
      widthMm: 70,
      heightMm: 120,
      xMm: 20,
      yMm: 30,
      bleedMm: 3,
      safeMm: 3,
      svgGroupId: "panel-front",
      cutPathId: "cut-front",
      bleedPathId: "bleed-front",
      safePathId: "safe-front",
      foldPathIds: ["fold-front-glue", "fold-front-left"],
      unprinted: false,
    });
    expect(front?.neighbours).toEqual([
      { panelName: "left", edge: "right", notes: "wraps around the side" },
      { panelName: "glue", edge: "left" },
    ]);
  });

  it("marks glue flaps unprinted without requiring bleed or safe paths", () => {
    const glue = parseDieline(tuckEndSvg(), defaults).panels.find((panel) => panel.name === "glue");
    expect(glue).toMatchObject({ role: "glue_flap", unprinted: true, bleedPathId: "", safePathId: "", widthMm: 15 });
  });

  it("requires bleed and safe paths on printed panels", () => {
    expect(codes(mutate(tuckEndSvg(), 'id="bleed-left"', 'id="bleedx-left"'))).toContain("bleed-missing");
    expect(codes(mutate(tuckEndSvg(), 'id="safe-front"', 'id="safex-front"'))).toContain("safe-missing");
  });

  it("checks bleed is 3 mm beyond the cut and safe 3 mm inside it", () => {
    expect(codes(mutate(tuckEndSvg(), 'd="M17 27H93V153H17Z"', 'd="M18 28H92V152H18Z"'))).toContain("bleed-mismatch");
    expect(codes(mutate(tuckEndSvg(), 'x="23" y="33" width="64"', 'x="22" y="33" width="64"'))).toContain("safe-mismatch");
    // Within the 0.1 mm tolerance is fine
    expect(codes(mutate(tuckEndSvg(), 'd="M17 27H93V153H17Z"', 'd="M16.95 27H93.05V153H16.95Z"'))).toEqual([]);
  });

  it("honours a per-panel safe zone (e.g. 5 mm for heavy creases)", () => {
    const svg = mutate(
      mutate(tuckEndSvg(), 'data-role="left" ', 'data-role="left" data-safe-mm="5" '),
      'd="M93 33H117V147H93Z"',
      'd="M95 35H115V145H95Z"',
    );
    const parsed = parseDieline(svg, defaults);
    expect(parsed.errors).toEqual([]);
    const left = parsed.panels.find((panel) => panel.name === "left");
    expect(left?.safeMm).toBe(5);
    expect(boardSafeRect({ ...left!, id: "x", boxId: "b" })).toEqual({ x: 95, y: 35, width: 20, height: 110 });
    expect(boardBleedRect({ ...left!, id: "x", boxId: "b" })).toEqual({ x: 87, y: 27, width: 36, height: 126 });
  });

  it("rejects non-mm units, offset viewBoxes and transforms", () => {
    expect(codes(mutate(tuckEndSvg(), 'width="130mm"', 'width="130px"'))).toContain("units-not-mm");
    expect(codes(mutate(tuckEndSvg(), 'viewBox="0 0 130 180"', 'viewBox="10 0 130 180"'))).toContain("viewbox-origin");
    expect(codes(mutate(tuckEndSvg(), 'width="130mm"', 'width="140mm"'))).toContain("units-mismatch");
    expect(codes(mutate(tuckEndSvg(), '<g id="panel-left"', '<g transform="scale(2)" id="panel-left"'))).toContain("transform");
  });

  it("flags unknown neighbours, duplicate ids and cuts beyond the board", () => {
    expect(codes(mutate(tuckEndSvg(), 'data-neighbour-left="front"', 'data-neighbour-left="back"'))).toContain("neighbour-unknown");
    expect(codes(mutate(tuckEndSvg(), 'id="fold-front-glue"', 'id="cut-front"'))).toContain("duplicate-id");
    expect(codes(mutate(tuckEndSvg(), 'd="M90 30H120V150H90Z"', 'd="M90 30H140V150H90Z"'))).toContain("cut-outside-board");
  });

  it("reads neighbours and roles from a sidecar JSON", () => {
    const parsed = parseDieline(tuckEndSvg(), {
      ...defaults,
      sidecar: { panels: { left: { neighbours: [{ panelName: "front", edge: "left", notes: "shares the spine" }] } } },
    });
    expect(parsed.panels.find((panel) => panel.name === "left")?.neighbours).toEqual([
      { panelName: "front", edge: "left", notes: "shares the spine" },
    ]);
  });

  it("swaps width and height for panels printed sideways", () => {
    const svg = mutate(tuckEndSvg(), 'data-role="left" ', 'data-role="left" data-rotation="90" ');
    const left = parseDieline(svg, defaults).panels.find((panel) => panel.name === "left");
    expect(left).toMatchObject({ rotationDeg: 90, widthMm: 120, heightMm: 30 });
  });

  it("reports an unreadable file instead of throwing", () => {
    expect(codes("<svg")).toContain("svg-unreadable");
  });
});

describe("registerDieline", () => {
  it("stores the SVG and upserts the box and panels by SKU", async () => {
    const storage = new MemoryObjectStorage();
    const repo = new StorageArtworkRepository(storage);
    const config = testConfig();
    const first = await registerDieline({ svg: tuckEndSvg(), storage, repo, config });
    expect(first.created).toBe(true);
    expect(first.box).toMatchObject({
      sku: "VA-FIXTURE-TE-70x30x120",
      boardWidthMm: 130,
      boardHeightMm: 180,
      finishedWidthMm: 70,
      defaultBleedMm: 3,
      defaultSafeMm: 3,
      spotLayerName: "CutContour",
      creaseLayerName: "Crease",
    });
    expect(await getText(storage, first.box.svgPath)).toBe(tuckEndSvg());
    expect((await repo.listPanels(first.box.id)).map((panel) => panel.name)).toEqual(["glue", "front", "left"]);

    const second = await registerDieline({ svg: tuckEndSvg(), storage, repo, config, overrides: { name: "Renamed" } });
    expect(second.created).toBe(false);
    expect(second.box.id).toBe(first.box.id);
    expect(second.box.name).toBe("Renamed");
    expect(second.panels.map((panel) => panel.id)).toEqual(first.panels.map((panel) => panel.id));
  });

  it("refuses an invalid dieline and stores nothing", async () => {
    const storage = new MemoryObjectStorage();
    const repo = new StorageArtworkRepository(storage);
    const svg = mutate(tuckEndSvg(), 'id="bleed-front"', 'id="bleedx-front"');
    await expect(registerDieline({ svg, storage, repo, config: testConfig() })).rejects.toBeInstanceOf(DielineValidationError);
    expect(storage.objects.size).toBe(0);
  });

  it("needs a SKU", async () => {
    const storage = new MemoryObjectStorage();
    const svg = mutate(tuckEndSvg(), 'data-sku="VA-FIXTURE-TE-70x30x120"', "");
    await expect(
      registerDieline({ svg, storage, repo: new StorageArtworkRepository(storage), config: testConfig() }),
    ).rejects.toThrow(/No SKU/);
  });
});
