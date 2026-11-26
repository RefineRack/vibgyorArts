import type { DielineScene, DielineVector } from "@/lib/dieline-types";

export type HingePose = {
  degrees: number;
  axis: DielineVector;
};

/**
 * Stage frames are absolute hinge angles at the end of that stage, not deltas.
 * A hinge can be keyed again in a later stage (a tuck folds back, then opens
 * as the lid closes). Progress 0 is the flat sheet. Progress 1 is the last stage.
 */
export function hingePoses(scene: DielineScene, progress: number): Map<string, HingePose> {
  const t = Math.min(1, Math.max(0, progress));
  const stageCount = scene.stages.length;
  const position = t * stageCount;
  const frames = new Map<string, { stage: number; angle: number; axis: DielineVector }[]>();

  scene.stages.forEach((stage, stageIndex) => {
    const seen = new Set<string>();
    for (const frame of stage) {
      if (seen.has(frame.hinge)) continue;
      seen.add(frame.hinge);
      const list = frames.get(frame.hinge) ?? [];
      list.push({ stage: stageIndex, angle: frame.angleDegrees, axis: frame.axis });
      frames.set(frame.hinge, list);
    }
  });

  const poses = new Map<string, HingePose>();
  for (const hinge of scene.hinges) {
    const keys = frames.get(hinge.name) ?? [];
    let degrees = 0;
    let axis = keys[0]?.axis ?? { x: 0, y: 0, z: 1 };
    for (const key of keys) {
      const stageEnd = key.stage + 1;
      if (position >= stageEnd) {
        degrees = key.angle;
        axis = key.axis;
        continue;
      }
      if (position <= key.stage) break;
      const local = position - key.stage;
      degrees += (key.angle - degrees) * local;
      axis = key.axis;
      break;
    }
    poses.set(hinge.name, { degrees, axis });
  }
  return poses;
}
