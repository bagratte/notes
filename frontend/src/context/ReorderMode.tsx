import { createContext, useCallback, useContext, useState } from "react";

interface Ctx { reorderMode: boolean; toggle: () => void; }
const ReorderModeContext = createContext<Ctx>({ reorderMode: false, toggle: () => {} });

// Reorder mode reveals a drag handle on each folder/document row so the list can
// be rearranged with any input (touch/pen via the handle gesture, mouse via
// native DnD). Only the Sidebar consumes this, so — unlike TouchMode — it needs
// no global DOM class or pre-paint init in main.tsx.
export function ReorderModeProvider({ children }: { children: React.ReactNode }) {
  const [reorderMode, setReorderMode] = useState(
    () => localStorage.getItem("reorderMode") === "true"
  );
  const toggle = useCallback(() => {
    setReorderMode(prev => {
      const next = !prev;
      localStorage.setItem("reorderMode", String(next));
      return next;
    });
  }, []);
  return (
    <ReorderModeContext.Provider value={{ reorderMode, toggle }}>
      {children}
    </ReorderModeContext.Provider>
  );
}

export const useReorderMode = () => useContext(ReorderModeContext);
