// Converts perfect-freehand's outline polygon to an SVG path string.
// Uses quadratic bezier curves through midpoints for smooth rendering.
export function svgPathFromStroke(points: number[][]): string {
  if (!points.length) return "";

  const d = points.reduce<string[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(
        x0.toFixed(2),
        y0.toFixed(2),
        ((x0 + x1) / 2).toFixed(2),
        ((y0 + y1) / 2).toFixed(2)
      );
      return acc;
    },
    ["M", points[0][0].toFixed(2), points[0][1].toFixed(2), "Q"]
  );

  return d.join(" ");
}
