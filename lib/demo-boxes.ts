import type { DielineScene } from "@/lib/dieline-types";
import type { SavedBox } from "@/lib/saved-boxes";

// Fixture saved boxes used in tests, empty-state stories and screenshot runs.
// They follow the same shape as Firestore `savedBoxes` records. Not shown in
// the live app unless NEXT_PUBLIC_DEMO_BOXES=1 (screenshot / local preview).

function rect(x: number, y: number, width: number, height: number) {
  return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
}

function scene(modelId: string, faces: DielineScene["faces"], hinges: DielineScene["hinges"]): DielineScene {
  return {
    schemaVersion: 1,
    modelId,
    unit: "mm",
    thickness: 0.4,
    faces,
    hinges,
    stages: [hinges.map((hinge) => ({ hinge: hinge.name, angleDegrees: 90, axis: { x: 0, y: 1, z: 0 } }))],
    orientation: { x: 0, y: 0, z: 1 },
    support: { folding: true, material: "blank", scope: "single-layer-hinge-rotation", productionValidated: false },
  };
}

/** Classic tuck-end net, 120 × 60 × 160 mm. */
export function tuckEndScene(): DielineScene {
  // Glue 15 + left 60 + front 120 + right 60 + back 120; tucks 40 mm above/below the front.
  const faces: DielineScene["faces"] = [
    { name: "Glue flap", path: rect(0, 40, 15, 160), holes: [] },
    { name: "Left", path: rect(15, 40, 60, 160), holes: [] },
    { name: "Front", path: rect(75, 40, 120, 160), holes: [] },
    { name: "Right", path: rect(195, 40, 60, 160), holes: [] },
    { name: "Back", path: rect(255, 40, 120, 160), holes: [] },
    { name: "Tuck flap", path: rect(75, 0, 120, 40), holes: [] },
    { name: "Dust flap left", path: rect(15, 0, 60, 40), holes: [] },
    { name: "Bottom tuck", path: rect(75, 200, 120, 40), holes: [] },
  ];
  const hinge = (name: string, parent: string, child: string, x: number, y: number) => ({
    name,
    parent,
    child,
    pivot: { x, y, z: 0 },
  });
  const hinges = [
    hinge("h-glue", "Left", "Glue flap", 15, 40),
    hinge("h-left", "Front", "Left", 75, 40),
    hinge("h-right", "Front", "Right", 195, 40),
    hinge("h-back", "Right", "Back", 255, 40),
    hinge("h-tuck", "Front", "Tuck flap", 75, 40),
    hinge("h-dust", "Left", "Dust flap left", 15, 40),
    hinge("h-bottom", "Front", "Bottom tuck", 75, 200),
  ];
  return scene("100001", faces, hinges);
}

/** Cardboard gable box with handle holes, 302 × 152 × 182 mm. */
export function gableScene(): DielineScene {
  // Left side | front | right side, bottom hanging from the front, gables above front and... wait
  // Layout: left 152×182, front 302×182, right 152×182; bottom 302×152 below front;
  // gable triangles (peak 76 mm) above front and, mirrored, we'd usually put one on the back.
  // A second gable sits above a simplified back to the right of the right wall? Keep it compact:
  // back sits below the bottom.
  const left = 0;
  const front = 152;
  const right = 152 + 302;
  const wallY = 76;
  const bottomY = 76 + 182;
  const backY = 76 + 182 + 152;
  const handle = (cx: number, cy: number) =>
    `M${cx - 24} ${cy} a24 10 0 1 0 48 0 a24 10 0 1 0 -48 0`;
  const gable = (x: number, y: number, width: number, peak: number) =>
    `M${x} ${y}L${x + width / 2} ${y - peak}L${x + width} ${y}Z`;
  const faces: DielineScene["faces"] = [
    { name: "Left", path: `M${left} ${wallY}H${front}V${wallY + 182}H${left}Z`, holes: [] },
    {
      name: "Front",
      path: `M${front} ${wallY}H${right}V${wallY + 182}H${front}Z`,
      holes: [],
    },
    { name: "Right", path: `M${right} ${wallY}H${right + 152}V${wallY + 182}H${right}Z`, holes: [] },
    { name: "Bottom", path: `M${front} ${bottomY}H${right}V${bottomY + 152}H${front}Z`, holes: [] },
    { name: "Back", path: `M${front} ${backY}H${right}V${backY + 182}H${front}Z`, holes: [] },
    { name: "Lid", path: gable(front, wallY, 302, 76), holes: [handle(front + 151, wallY - 32)] },
    { name: "Lid flap", path: gable(front, backY + 182, 302, -76), holes: [handle(front + 151, backY + 182 + 32)] },
  ];
  const hinge = (name: string, parent: string, child: string, x: number, y: number) => ({
    name,
    parent,
    child,
    pivot: { x, y, z: 0 },
  });
  const hinges = [
    hinge("h-left", "Front", "Left", front, wallY),
    hinge("h-right", "Front", "Right", right, wallY),
    hinge("h-bottom", "Front", "Bottom", front, bottomY),
    hinge("h-back", "Bottom", "Back", front, backY),
    hinge("h-lid", "Front", "Lid", front, wallY),
    hinge("h-lid-flap", "Back", "Lid flap", front, backY + 182),
  ];
  return scene("100010", faces, hinges);
}

export const DEMO_SAVED_BOXES: SavedBox[] = [
  {
    id: "demo-gable-1",
    name: "Cardboard gable box mockup",
    modelId: "100010",
    image: "/logo.jpeg",
    length: 302,
    width: 152,
    height: 182,
    thickness: 0.4,
    scene: gableScene(),
    artwork: "",
  },
  {
    id: "demo-gable-2",
    name: "Cardboard gable box mockup",
    modelId: "100010",
    image: "/logo.jpeg",
    length: 302,
    width: 152,
    height: 182,
    thickness: 0.4,
    scene: gableScene(),
    artwork: "",
  },
  {
    id: "demo-box1",
    name: "box1",
    modelId: "100001",
    image: "/logo.jpeg",
    length: 120,
    width: 60,
    height: 160,
    thickness: 0.4,
    scene: tuckEndScene(),
    artwork: "",
  },
];

export function demoBoxesEnabled() {
  return process.env.NEXT_PUBLIC_DEMO_BOXES === "1";
}
