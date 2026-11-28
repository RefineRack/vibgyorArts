import { describe, expect, it } from "vitest";
import { preparePacdoraScene, skuForModel } from "@/lib/artwork/prepare-scene";
import { tuckEndScene } from "@/lib/demo-boxes";

describe("preparePacdoraScene", () => {
  it("converts a Pacdora scene into a draft dieline with named panels", () => {
    const prepared = preparePacdoraScene(tuckEndScene(), { name: "box1" });
    expect(prepared.sku).toBe("PD-100001");
    expect(prepared.draft).toBe(true);
    expect(prepared.errors).toEqual([]);
    expect(prepared.warnings.some((issue) => issue.code === "draft")).toBe(true);
    expect(prepared.panels.some((panel) => panel.role === "front")).toBe(true);
    expect(prepared.panels.some((panel) => panel.unprinted && panel.role === "glue_flap")).toBe(true);
    expect(prepared.svg).toContain('data-draft="true"');
  });

  it("builds a stable SKU from the Pacdora model id", () => {
    expect(skuForModel("100010")).toBe("PD-100010");
  });
});
