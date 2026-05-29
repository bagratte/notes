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

// Flips the HSL lightness of a hex color (L → 100 - L), preserving hue and saturation.
// Used for dark mode stroke rendering so stored colors remain unchanged.
export function flipLightness(hex: string): string {
  let src = hex;
  let alpha = "";
  const m8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(hex);
  if (m8) { src = "#" + m8[1]; alpha = m8[2]; }

  const m = /^#([0-9a-f]{6})$/i.exec(src);
  if (!m) return hex;

  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }

  const l2 = 1 - l;
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
  const p = 2 * l2 - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(hue2rgb(h + 1 / 3))}${toHex(hue2rgb(h))}${toHex(hue2rgb(h - 1 / 3))}${alpha}`;
}
