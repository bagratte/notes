import { useEffect, useState } from "react";
import { getStroke } from "perfect-freehand";
import { svgPathFromStroke } from "@/components/Canvas/utils";
import { sections as sectionsApi, strokes as strokesApi } from "@/api";
import type { Section, Stroke } from "@/types";
import RegionPreview from "@/components/NoteEditor/RegionPreview";

const PREVIEW_W = 420;
const MAX_PREVIEW_H = 560;
const STROKE_SECTION_H = 190;
const PADDING = 12;

const STROKE_OPTS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
};

interface SectionData {
  section: Section;
  strokes: Stroke[];
}

function StrokeSectionPreview({ strokes }: { strokes: Stroke[] }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const [px, py] of s.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  minX -= PADDING; minY -= PADDING;
  maxX += PADDING; maxY += PADDING;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <svg
      width="100%"
      height={STROKE_SECTION_H}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", background: "#fff" }}
    >
      {strokes.map((s) => {
        const outline = getStroke(s.points, { ...STROKE_OPTS, size: s.width });
        const d = svgPathFromStroke(outline);
        return <path key={s.id} d={d} fill={s.color} />;
      })}
    </svg>
  );
}

interface Props {
  noteId: number;
  x: number;
  y: number;
}

export default function NoteStrokePreview({ noteId, x, y }: Props) {
  const [sections, setSections] = useState<SectionData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    (async () => {
      const secs = await sectionsApi.list(noteId);
      const groups = await Promise.all(secs.map((s) => strokesApi.listForSection(s.id)));
      if (!cancelled) {
        setSections(secs.map((section, i) => ({ section, strokes: groups[i] })));
      }
    })();
    return () => { cancelled = true; };
  }, [noteId]);

  // Clamp to viewport
  const clampedX = Math.min(x, window.innerWidth - PREVIEW_W - 8);
  const clampedY = Math.min(y, window.innerHeight - MAX_PREVIEW_H - 8);
  return (
    <div
      style={{
        position: "fixed",
        left: clampedX,
        top: clampedY,
        width: PREVIEW_W,
        maxHeight: MAX_PREVIEW_H,
        background: "#f8f6f2",
        border: "1px solid #e0dbd3",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
        zIndex: 300,
        pointerEvents: "none",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {sections === null ? (
        <div style={{ padding: 16, fontSize: 12, color: "#bbb", textAlign: "center" }}>Loading…</div>
      ) : sections.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: "#bbb", textAlign: "center" }}>Empty note</div>
      ) : (
        sections.map((sd, i) => (
          <div
            key={sd.section.id}
            style={{
              borderTop: i > 0 ? "1px solid #ece8e2" : undefined,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {sd.strokes.length > 0 ? (
              <StrokeSectionPreview strokes={sd.strokes} />
            ) : (
              <RegionPreview sectionId={sd.section.id} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
