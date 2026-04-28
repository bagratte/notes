import { useState, useEffect } from "react";
import { sections as sectionsApi } from "@/api";
import type { Section } from "@/types";
import SectionCanvas from "./SectionCanvas";
import { PenToolbar, DEFAULT_PEN } from "@/components/PenToolbar";
import type { PenSettings, PenToolbarMode } from "@/components/PenToolbar";
import { useDrawingSettings } from "@/context/DrawingSettings";

interface Props {
  noteId: number;
}

export default function NoteEditor({ noteId }: Props) {
  const { settings: ds, update: updateDs } = useDrawingSettings();
  const [sectionList, setSectionList] = useState<Section[]>([]);
  const [adding, setAdding] = useState(false);
  const [pen, setPen] = useState<PenSettings>(DEFAULT_PEN);
  const [mode, setMode] = useState<PenToolbarMode>("annotate");

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
      <PenToolbar
        settings={pen}
        onChange={setPen}
        mode={mode}
        onModeChange={setMode}
        fingerScrolls={ds.fingerScrolls}
        onFingerScrollsChange={(v) => updateDs({ fingerScrolls: v })}
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
          pen={pen}
          inputEnabled={mode !== "hand"}
          eraserMode={mode === "stroke-eraser"}
          segmentEraserMode={mode === "segment-eraser"}
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
