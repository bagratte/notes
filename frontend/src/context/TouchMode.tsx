import { createContext, useCallback, useContext, useState } from "react";

interface Ctx { isTouch: boolean; toggle: () => void; }
const TouchModeContext = createContext<Ctx>({ isTouch: false, toggle: () => {} });

export function TouchModeProvider({ children }: { children: React.ReactNode }) {
  const [isTouch, setIsTouch] = useState(
    () => localStorage.getItem("touchMode") === "true"
  );
  const toggle = useCallback(() => {
    setIsTouch(prev => {
      const next = !prev;
      localStorage.setItem("touchMode", String(next));
      document.documentElement.classList.toggle("has-touch", next);
      return next;
    });
  }, []);
  return (
    <TouchModeContext.Provider value={{ isTouch, toggle }}>
      {children}
    </TouchModeContext.Provider>
  );
}

export const useTouchMode = () => useContext(TouchModeContext);
