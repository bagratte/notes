type Pt = [number, number, number];

function lerp(p1: Pt, p2: Pt, t: number): Pt {
  return [
    p1[0] + t * (p2[0] - p1[0]),
    p1[1] + t * (p2[1] - p1[1]),
    p1[2] + t * (p2[2] - p1[2]),
  ];
}

// Returns t-values in [0,1] (sorted) where segment A→B crosses the circle.
function segmentCircleIntersect(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  r: number,
): number[] {
  const dx = bx - ax, dy = by - ay;
  const ex = ax - cx, ey = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return [];
  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].filter(t => t >= 0 && t <= 1).sort((x, y) => x - y);
}

/**
 * Erases a circular region from a stroke's centerline.
 *
 * r should already include the stroke's half-width so the cut reaches the
 * visual edge of the rendered stroke.
 *
 * Returns null when the stroke is completely unaffected (fast path for callers).
 * Otherwise returns 0..N sub-stroke point arrays representing the parts that remain.
 */
export function eraseFromStroke(points: Pt[], cx: number, cy: number, r: number): Pt[][] | null {
  if (points.length < 2) return null;

  const inside = (p: Pt) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < r * r;

  // Quick reject: bounding-box check before iterating all segments
  let anyNear = false;
  for (const p of points) {
    if (Math.abs(p[0] - cx) < r + 1 && Math.abs(p[1] - cy) < r + 1) { anyNear = true; break; }
  }
  if (!anyNear) return null;

  const result: Pt[][] = [];
  let current: Pt[] = [];
  let prevInside = inside(points[0]);

  if (!prevInside) current.push(points[0]);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const curInside = inside(cur);
    const ts = segmentCircleIntersect(prev[0], prev[1], cur[0], cur[1], cx, cy, r);

    if (!prevInside && !curInside) {
      if (ts.length >= 2) {
        // Segment passes through the eraser
        current.push(lerp(prev, cur, ts[0]));
        if (current.length >= 2) result.push(current);
        current = [lerp(prev, cur, ts[1]), cur];
      } else {
        current.push(cur);
      }
    } else if (!prevInside && curInside) {
      // Entering eraser
      if (ts.length >= 1) current.push(lerp(prev, cur, ts[0]));
      if (current.length >= 2) result.push(current);
      current = [];
    } else if (prevInside && !curInside) {
      // Exiting eraser
      const t = ts.length >= 1 ? ts[ts.length - 1] : 0;
      current = [lerp(prev, cur, t), cur];
    }
    // both inside → skip

    prevInside = curInside;
  }

  if (current.length >= 2) result.push(current);

  // If result equals the original unmodified stroke, report no change
  if (result.length === 1 && result[0].length === points.length) return null;

  return result;
}
