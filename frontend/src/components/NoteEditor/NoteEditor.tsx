import { useState, useEffect } from "react";
import { sections as sectionsApi } from "@/api";
import type { Section, ToolMode } from "@/types";
import SectionCanvas from "./SectionCanvas";
import { CanvasToolbar, DEFAULT_PEN } from "@/components/CanvasToolbar";
import type { PenSettings } from "@/components/CanvasToolbar";

interface Props {
  noteId: number;
}

export default function NoteEditor({ noteId }: Props) {
  const [sectionList, setSectionList] = useState<Section[]>([]);
  const [adding, setAdding] = useState(false);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [tool, setTool] = useState<ToolMode>("auto");
  const [hwOverride, setHwOverride] = useState<"stroke-eraser" | "segment-eraser" | null>(null);

  useEffect(() => {
    sectionsApi.list(noteId).then(setSectionList);
  }, [noteId]);

  const addSection = async () => {
    setAdding(true);
    const section = await sectionsApi.create(noteId, sectionList.length);
    setSectionList((prev) => [...prev, section]);
    setAdding(false);
  };

  const deleteSection = async (id: number) => {
    await sectionsApi.delete(id);
    setSectionList((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <CanvasToolbar
        settings={pen}
        onChange={setPen}
        tool={tool}
        onToolChange={setTool}
        activeOverride={hwOverride}
      />

      {sectionList.length === 0 && (
        <div
          style={{
            height: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#aaa",
            fontSize: 14,
            background: "#fff",
            borderRadius: 4,
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          No sections yet — add one below
        </div>
      )}

      {sectionList.map((section) => (
        <SectionCanvas
          key={section.id}
          sectionId={section.id}
          initialHeight={section.height}
          pen={pen}
          inputEnabled={tool !== "hand"}
          eraserMode={tool === "stroke-eraser"}
          segmentEraserMode={tool === "segment-eraser"}
          onHwOverrideChange={setHwOverride}
          onDelete={() => deleteSection(section.id)}
        />
      ))}

      <button
        onClick={addSection}
        disabled={adding}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          borderRadius: 4,
          border: "1px dashed #ccc",
          background: "transparent",
          cursor: "pointer",
          fontSize: 13,
          color: "#666",
          alignSelf: "flex-start",
        }}
      >
        {adding ? "Adding…" : "+ Add section"}
      </button>
    </div>
  );
}
