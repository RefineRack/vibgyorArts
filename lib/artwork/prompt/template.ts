// Gemini prompt template, verbatim from brief section 6. Do not free-hand
// prompts in application code: change this file (and bump the version) instead.
// One deliberate change: the bleed figure on the "fill the full frame" line is
// {panel.bleedMm} rather than a literal 3, so panels with a non-default bleed stay
// truthful. With the default 3 mm bleed the text is identical to the brief.

export const PROMPT_TEMPLATE_VERSION = "2026-11-26.1";

export const PANEL_PROMPT_TEMPLATE = `You are generating print artwork for one panel of a folding carton. Output a single image only. Do not draw die lines, fold lines, crop marks, rulers, or a box outline. Do not render logos or typography — leave clear space where those will be placed.

PANEL
- Role: {panel.role} ({panel.name})
- Trim size: {panel.widthMm} mm × {panel.heightMm} mm
- Image must fill the full frame, which already includes {panel.bleedMm} mm bleed on every side
- Safe zone: keep the central {safeWidthMm} mm × {safeHeightMm} mm free of important detail at the edges; edges will be trimmed
- Print facing: {panel.printFacing}
- Do not place essential detail in the outer {panel.bleedMm} mm (bleed) or in the next {panel.safeMm} mm (safe)

BRAND AND STYLE
- Brand: {job.brandName}
- Style: {brief.styleDescriptor}
- Palette (use these hues; do not introduce extra accent colours):
{palette_bullets}
- Finishing notes (visual mood only; do not draw foil or varnish as effects unless asked to leave a mask-like empty area): {finishing_notes}

LAYOUT
- This panel's job: {panel_layout_instruction}
- Reserved vector placements (leave clean, uncluttered space, no lettering):
{reserved_slots}
- Copy that will be set later in vector type (do not letter it): {text_inventory}

CONTINUITY
- Neighbouring panels: {neighbour_description}
- Continuity notes from the brief: {brief.continuityNotes}

CONSTRAINTS
- Full-bleed background or pattern; extend texture all the way to every edge of the frame
- No text, no logo lock-ups, no barcodes, no fake dielines, no mock-up shadows, no studio background
- No watermarks, no frames, no rounded corners
- Flat, print-ready illustration or pattern; not a photograph of a physical box`;

const PLACEHOLDER = /\{([a-zA-Z_.]+)\}/g;

export function templateVariables(template = PANEL_PROMPT_TEMPLATE) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

/** Strict render: every placeholder must be supplied and no extra keys are allowed. */
export function renderTemplate(values: Record<string, string>, template = PANEL_PROMPT_TEMPLATE) {
  const expected = templateVariables(template);
  const missing = expected.filter((key) => values[key] === undefined);
  const extra = Object.keys(values).filter((key) => !expected.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Prompt variables do not match the template. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
  }
  return template.replace(PLACEHOLDER, (_, key: string) => values[key]);
}
