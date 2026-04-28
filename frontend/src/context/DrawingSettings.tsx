import { createContext, useContext, useState, useCallback } from "react";

export interface DrawingSettings {
  streamline: number;
  predictive: boolean;
  thinning: number;
  smoothing: number;
  simulatePressure: boolean;
  palmRejection: boolean;
  palmThreshold: number;
  fingerScrolls: boolean;
}

export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  streamline: 0.1,
  predictive: false,
  thinning: 0.5,
  smoothing: 0.5,
  simulatePressure: false,
  palmRejection: true,
  palmThreshold: 60,
  fingerScrolls: true,
};

const STORAGE_KEY = "drawingSettings";

function load(): DrawingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_DRAWING_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_DRAWING_SETTINGS;
}

function persist(s: DrawingSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Ctx {
  settings: DrawingSettings;
  update: (patch: Partial<DrawingSettings>) => void;
  reset: () => void;
}

const DrawingSettingsContext = createContext<Ctx | null>(null);

export function DrawingSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<DrawingSettings>(load);

  const update = useCallback((patch: Partial<DrawingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    persist(DEFAULT_DRAWING_SETTINGS);
    setSettings(DEFAULT_DRAWING_SETTINGS);
  }, []);

  return (
    <DrawingSettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </DrawingSettingsContext.Provider>
  );
}

export function useDrawingSettings(): Ctx {
  const ctx = useContext(DrawingSettingsContext);
  if (!ctx) throw new Error("useDrawingSettings must be used inside DrawingSettingsProvider");
  return ctx;
}
