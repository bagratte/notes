import { useCallback, useEffect, useState } from "react";

// Immersive reading: hides app chrome (every element with the global
// `immersive-hide` class, via `html.immersive` in index.css) and asks the
// browser for real fullscreen so its own UI (address bar) goes away too.
// Leaving browser fullscreen by other means (Esc, Android back gesture)
// also leaves immersive mode. Where the Fullscreen API is unavailable the
// app chrome is still hidden.
export function useImmersive() {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("immersive", immersive);
  }, [immersive]);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.documentElement.classList.remove("immersive");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const enter = useCallback(() => {
    setImmersive(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    setImmersive(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  return { immersive, enter, exit };
}
