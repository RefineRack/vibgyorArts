export type DielineVector = {
  x: number;
  y: number;
  z: number;
};

export type DielineFace = {
  name: string;
  path: string;
  holes: string[];
};

export type DielineHinge = {
  name: string;
  parent: string;
  child: string;
  pivot: DielineVector;
};

export type DielineFrame = {
  hinge: string;
  angleDegrees: number;
  axis: DielineVector;
};

export type DielineScene = {
  schemaVersion: 1;
  modelId: string;
  unit: "mm";
  thickness: number;
  faces: DielineFace[];
  hinges: DielineHinge[];
  stages: DielineFrame[][];
  orientation: DielineVector;
  support: {
    folding: true;
    material: "blank";
    scope: "single-layer-hinge-rotation";
    productionValidated: false;
  };
};

export function isDielineScene(value: unknown): value is DielineScene {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<DielineScene>;
  return (
    scene.schemaVersion === 1 &&
    scene.unit === "mm" &&
    typeof scene.thickness === "number" &&
    Array.isArray(scene.faces) &&
    Array.isArray(scene.hinges) &&
    Array.isArray(scene.stages) &&
    !!scene.orientation &&
    scene.support?.scope === "single-layer-hinge-rotation"
  );
}
