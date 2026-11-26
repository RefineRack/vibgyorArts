import {
  BufferGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { dielineBounds } from "@/lib/dieline-art";
import { hingePoses } from "@/lib/dieline-fold";
import type { DielineScene, DielineVector } from "@/lib/dieline-types";
import { flattenSvgPath, type PathPoint } from "@/lib/svg-path";

export type DielineModel = {
  object: Group;
  setFold: (progress: number) => void;
  setArtwork: (image: HTMLImageElement) => void;
  dispose: () => void;
};

function signedArea(points: PathPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return sum / 2;
}

function contour(points: PathPoint[], target: Shape | Path) {
  target.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    target.lineTo(points[index].x, points[index].y);
  }
}

function faceShape(path: string, holes: string[]) {
  const outlines = flattenSvgPath(path);
  if (outlines.length === 0) return null;
  const outer = outlines.reduce((largest, candidate) =>
    Math.abs(signedArea(candidate)) > Math.abs(signedArea(largest)) ? candidate : largest,
  );
  const shape = new Shape();
  contour(outer, shape);
  const outerArea = signedArea(outer);
  for (const holePath of holes) {
    for (const hole of flattenSvgPath(holePath)) {
      if (hole.length < 3) continue;
      const ordered = outerArea * signedArea(hole) > 0 ? [...hole].reverse() : hole;
      const holeShape = new Path();
      contour(ordered, holeShape);
      shape.holes.push(holeShape);
    }
  }
  return shape;
}

/**
 * Faces are SVG paths in millimetres, x right and y down, extruded through
 * thickness on +z. Hinge pivots sit on the paper midplane in that same space.
 * Each hinge group rotates about the returned axis with the right-hand rule.
 * `orientation` is an XYZ Euler in radians applied to the whole tree.
 */
export function createDielineModel(scene: DielineScene): DielineModel {
  const material = new MeshStandardMaterial({
    color: 0xf7f1e4,
    roughness: 0.72,
    metalness: 0,
    side: DoubleSide,
  });
  const geometries: BufferGeometry[] = [];
  const hinges = new Map<string, Group>();
  const faces = new Map(scene.faces.map((face) => [face.name, face]));
  const children = new Map<string, typeof scene.hinges>();
  const childNames = new Set<string>();

  for (const hinge of scene.hinges) {
    childNames.add(hinge.child);
    const list = children.get(hinge.parent) ?? [];
    list.push(hinge);
    children.set(hinge.parent, list);
  }

  function buildFace(name: string, origin: DielineVector, stack: Set<string>) {
    const group = new Group();
    group.name = name;
    if (stack.has(name)) return group;
    const face = faces.get(name);
    if (!face) return group;
    stack.add(name);
    const shape = faceShape(face.path, face.holes);
    if (shape) {
      const geometry = new ExtrudeGeometry(shape, {
        depth: scene.thickness,
        bevelEnabled: false,
      });
      geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(-origin.x, -origin.y, -origin.z);
      group.add(mesh);
    }
    for (const hinge of children.get(name) ?? []) {
      const pivot = new Group();
      pivot.name = `hinge:${hinge.name}`;
      pivot.position.set(hinge.pivot.x - origin.x, hinge.pivot.y - origin.y, hinge.pivot.z - origin.z);
      pivot.add(buildFace(hinge.child, hinge.pivot, stack));
      hinges.set(hinge.name, pivot);
      group.add(pivot);
    }
    stack.delete(name);
    return group;
  }

  const orient = new Group();
  orient.name = "orientation";
  orient.rotation.set(scene.orientation.x, scene.orientation.y, scene.orientation.z);
  const roots = scene.faces.filter((face) => !childNames.has(face.name));
  const rootFaces = roots.length > 0 ? roots : scene.faces.slice(0, 1);
  for (const face of rootFaces) {
    orient.add(buildFace(face.name, { x: 0, y: 0, z: 0 }, new Set()));
  }

  const axis = new Vector3();
  const rotation = new Quaternion();
  const bounds = dielineBounds(scene);
  let artwork: Texture | null = null;

  function writeAtlasUvs(geometry: BufferGeometry) {
    if (!bounds) return;
    const position = geometry.getAttribute("position");
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      uv[index * 2] = (position.getX(index) - bounds.minX) / bounds.width;
      uv[index * 2 + 1] = 1 - (position.getY(index) - bounds.minY) / bounds.height;
    }
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  }

  return {
    object: orient,
    setArtwork(image: HTMLImageElement) {
      for (const geometry of geometries) writeAtlasUvs(geometry);
      artwork?.dispose();
      artwork = new Texture(image);
      artwork.colorSpace = SRGBColorSpace;
      artwork.needsUpdate = true;
      material.color.set(0xffffff);
      material.map = artwork;
      material.needsUpdate = true;
    },
    setFold(progress: number) {
      const poses = hingePoses(scene, progress);
      for (const [name, pivot] of hinges) {
        const pose = poses.get(name);
        if (!pose) {
          pivot.quaternion.identity();
          continue;
        }
        axis.set(pose.axis.x, pose.axis.y, pose.axis.z);
        if (axis.lengthSq() < 1e-8 || pose.degrees === 0) {
          pivot.quaternion.identity();
          continue;
        }
        axis.normalize();
        rotation.setFromAxisAngle(axis, (pose.degrees * Math.PI) / 180);
        pivot.quaternion.copy(rotation);
      }
    },
    dispose() {
      artwork?.dispose();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
