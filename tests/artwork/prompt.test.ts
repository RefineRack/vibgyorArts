import { describe, expect, it } from "vitest";
import { PANEL_PROMPT_TEMPLATE, composePanelPrompt, renderTemplate, templateVariables } from "@/lib/artwork";
import { setup } from "./helpers";

async function prompts(options?: Parameters<typeof setup>[0]) {
  const { box, job, panels } = await setup(options);
  const byName = Object.fromEntries(panels.map((panel) => [panel.name, panel]));
  return { box, job, byName };
}

describe("prompt template", () => {
  it("keeps the brief's section 6 wording", () => {
    expect(PANEL_PROMPT_TEMPLATE.startsWith("You are generating print artwork for one panel of a folding carton.")).toBe(true);
    expect(PANEL_PROMPT_TEMPLATE).toContain("- No text, no logo lock-ups, no barcodes, no fake dielines, no mock-up shadows, no studio background");
    expect(templateVariables()).toEqual(
      expect.arrayContaining(["panel.role", "safeWidthMm", "palette_bullets", "reserved_slots", "neighbour_description", "brief.continuityNotes"]),
    );
  });

  it("refuses missing or unknown variables", () => {
    expect(() => renderTemplate({ "panel.role": "front" })).toThrow(/Missing/);
    expect(() => renderTemplate({ x: "1" }, "{y}")).toThrow(/Extra: x/);
  });
});

describe("composePanelPrompt", () => {
  it("fills every variable for the front panel", async () => {
    const { box, job, byName } = await prompts();
    const { prompt, texts } = composePanelPrompt(box, job, byName.front, {}, Object.values(byName));
    expect(prompt).not.toMatch(/\{[a-zA-Z_.]+\}/);
    expect(prompt).toContain("- Role: front (front)");
    expect(prompt).toContain("- Trim size: 70 mm × 120 mm");
    expect(prompt).toContain("which already includes 3 mm bleed on every side");
    expect(prompt).toContain("keep the central 64 mm × 114 mm free");
    expect(prompt).toContain("- Brand: Leaf & Lantern");
    expect(prompt).toContain("- Forest green #1F4D3A\n- Parchment #E9D8A6");
    expect(prompt).toContain("- This panel's job: hero face, primary visual focus");
    expect(prompt).toContain("- Logo, top centre, ~32 mm wide, inside safe zone");
    expect(prompt).toContain("- Product name, lower third, inside safe zone");
    expect(prompt).toContain('(do not letter it): "Leaf & Lantern", "Earl Grey Reserve"');
    expect(prompt).toContain("right edge meets panel 'left' along the height (wraps around the side)");
    expect(prompt).toContain("left edge meets unprinted panel 'glue'; no continuity needed there");
    expect(prompt).toContain("Continuity notes from the brief: botanical pattern wraps from the front onto the left side");
    expect(prompt).toContain("aqueous coating");
    expect(texts.map((text) => text.role)).toEqual(["brand", "product"]);
  });

  it("follows panel hints and leaves logos off side panels", async () => {
    const { box, job, byName } = await prompts();
    const { prompt } = composePanelPrompt(box, job, byName.left);
    expect(prompt).toContain('"20 pyramid tea bags"');
    expect(prompt).not.toContain("Logo,");
    expect(prompt).toContain("- Variant line, below the product name, inside safe zone");
  });

  it("only reserves a logo slot when the brief has logos", async () => {
    const { box, job, byName } = await prompts({ withLogo: false });
    expect(composePanelPrompt(box, job, byName.front).prompt).not.toContain("Logo,");
  });

  it("applies job overrides and is deterministic", async () => {
    const { box, job, byName } = await prompts();
    const overrides = {
      layoutInstructions: { front: "quiet hero with a single sprig" },
      placements: { front: [{ kind: "logo" as const, position: "bottom left" }] },
    };
    const a = composePanelPrompt(box, job, byName.front, overrides).prompt;
    expect(a).toContain("- This panel's job: quiet hero with a single sprig");
    expect(a).toContain("- Logo, bottom left, inside safe zone");
    expect(composePanelPrompt(box, job, byName.front, overrides).prompt).toBe(a);
  });

  it("mentions foil only where the brief places it", async () => {
    const { box, job, byName } = await prompts();
    job.brief.finishing.foil = { colour: "gold", panelNames: ["front"] };
    expect(composePanelPrompt(box, job, byName.front).prompt).toContain("gold foil on this panel");
    expect(composePanelPrompt(box, job, byName.left).prompt).toContain("gold foil elsewhere on the box");
  });
});
