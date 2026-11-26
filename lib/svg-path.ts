export type PathPoint = { x: number; y: number };

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][-+]?\d+)?/g;

const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

type Command = { op: string; args: number[] };

function commands(d: string) {
  const tokens = d.match(TOKEN) ?? [];
  const list: Command[] = [];
  let op = "";
  let args: number[] = [];

  function flush() {
    if (!op) return;
    const count = ARITY[op.toLowerCase()];
    if (count === undefined) {
      op = "";
      args = [];
      return;
    }
    if (count === 0) {
      list.push({ op, args: [] });
      args = [];
      return;
    }
    while (args.length >= count) {
      list.push({ op, args: args.splice(0, count) });
      if (op === "m") op = "l";
      if (op === "M") op = "L";
    }
  }

  for (const token of tokens) {
    if (/[a-zA-Z]/.test(token)) {
      flush();
      op = token;
      args = [];
      if (ARITY[op.toLowerCase()] === 0) flush();
    } else {
      args.push(Number(token));
    }
  }
  flush();
  return list;
}

function sampleCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  steps: number,
  push: (x: number, y: number) => void,
) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const u = 1 - t;
    push(
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    );
  }
}

function sampleArc(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number,
  push: (x: number, y: number) => void,
) {
  if (rx === 0 || ry === 0) {
    push(x2, y2);
    return;
  }
  const phi = (rotation * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);
  const lambda = (x1p * x1p) / (radiusX * radiusX) + (y1p * y1p) / (radiusY * radiusY);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    radiusX *= scale;
    radiusY *= scale;
  }
  const sign = large === sweep ? -1 : 1;
  const numerator =
    radiusX * radiusX * radiusY * radiusY -
    radiusX * radiusX * y1p * y1p -
    radiusY * radiusY * x1p * x1p;
  const denominator = radiusX * radiusX * y1p * y1p + radiusY * radiusY * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = coef * ((radiusX * y1p) / radiusY);
  const cyp = coef * ((-radiusY * x1p) / radiusX);
  const centerX = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const centerY = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function vectorAngle(ux: number, uy: number, vx: number, vy: number) {
    const dot = ux * vx + uy * vy;
    const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let angle = Math.acos(Math.min(1, Math.max(-1, dot / (length || 1))));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  }

  const start = vectorAngle(1, 0, (x1p - cxp) / radiusX, (y1p - cyp) / radiusY);
  let delta = vectorAngle(
    (x1p - cxp) / radiusX,
    (y1p - cyp) / radiusY,
    (-x1p - cxp) / radiusX,
    (-y1p - cyp) / radiusY,
  );
  if (sweep === 0 && delta > 0) delta -= Math.PI * 2;
  if (sweep === 1 && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  for (let step = 1; step <= steps; step += 1) {
    const theta = start + delta * (step / steps);
    const localX = radiusX * Math.cos(theta);
    const localY = radiusY * Math.sin(theta);
    push(
      cosPhi * localX - sinPhi * localY + centerX,
      sinPhi * localX + cosPhi * localY + centerY,
    );
  }
}

/** Flatten one SVG path into closed contours. Coordinates stay in the path's own space. */
export function flattenSvgPath(d: string): PathPoint[][] {
  const contours: PathPoint[][] = [];
  let current: PathPoint[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;

  function push(nextX: number, nextY: number) {
    current.push({ x: nextX, y: nextY });
    x = nextX;
    y = nextY;
  }

  function open(nextX: number, nextY: number) {
    if (current.length > 2) contours.push(current);
    current = [{ x: nextX, y: nextY }];
    x = nextX;
    y = nextY;
    startX = nextX;
    startY = nextY;
  }

  for (const command of commands(d)) {
    const { op, args } = command;
    const relative = op === op.toLowerCase();
    if (op === "M" || op === "m") {
      open(relative ? x + args[0] : args[0], relative ? y + args[1] : args[1]);
      controlX = x;
      controlY = y;
    } else if (op === "L" || op === "l") {
      push(relative ? x + args[0] : args[0], relative ? y + args[1] : args[1]);
      controlX = x;
      controlY = y;
    } else if (op === "H" || op === "h") {
      push(relative ? x + args[0] : args[0], y);
      controlX = x;
      controlY = y;
    } else if (op === "V" || op === "v") {
      push(x, relative ? y + args[0] : args[0]);
      controlX = x;
      controlY = y;
    } else if (op === "C" || op === "c") {
      const x1 = relative ? x + args[0] : args[0];
      const y1 = relative ? y + args[1] : args[1];
      const x2 = relative ? x + args[2] : args[2];
      const y2 = relative ? y + args[3] : args[3];
      const x3 = relative ? x + args[4] : args[4];
      const y3 = relative ? y + args[5] : args[5];
      sampleCubic(x, y, x1, y1, x2, y2, x3, y3, 8, push);
      controlX = x2;
      controlY = y2;
    } else if (op === "S" || op === "s") {
      const x1 = x * 2 - controlX;
      const y1 = y * 2 - controlY;
      const x2 = relative ? x + args[0] : args[0];
      const y2 = relative ? y + args[1] : args[1];
      const x3 = relative ? x + args[2] : args[2];
      const y3 = relative ? y + args[3] : args[3];
      sampleCubic(x, y, x1, y1, x2, y2, x3, y3, 8, push);
      controlX = x2;
      controlY = y2;
    } else if (op === "Q" || op === "q") {
      const x1 = relative ? x + args[0] : args[0];
      const y1 = relative ? y + args[1] : args[1];
      const x2 = relative ? x + args[2] : args[2];
      const y2 = relative ? y + args[3] : args[3];
      sampleCubic(x, y, x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2), x2, y2, 8, push);
      controlX = x1;
      controlY = y1;
    } else if (op === "T" || op === "t") {
      const x1 = x * 2 - controlX;
      const y1 = y * 2 - controlY;
      const x2 = relative ? x + args[0] : args[0];
      const y2 = relative ? y + args[1] : args[1];
      sampleCubic(x, y, x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2), x2, y2, 8, push);
      controlX = x1;
      controlY = y1;
    } else if (op === "A" || op === "a") {
      const endX = relative ? x + args[5] : args[5];
      const endY = relative ? y + args[6] : args[6];
      sampleArc(x, y, args[0], args[1], args[2], args[3], args[4], endX, endY, push);
      controlX = x;
      controlY = y;
    } else if (op === "Z" || op === "z") {
      if (current.length > 2) contours.push(current);
      current = [];
      x = startX;
      y = startY;
      controlX = x;
      controlY = y;
    }
  }
  if (current.length > 2) contours.push(current);
  return contours;
}
