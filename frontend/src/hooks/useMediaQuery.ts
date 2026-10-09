import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handle = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, [query]);
  return matches;
}

// Phone-sized screen in either orientation (Moto G Stylus: ~434×964 CSS px).
export const PHONE_QUERY = "(max-width: 600px), (max-height: 600px)";
