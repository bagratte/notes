import { useRef, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { useTouchMode } from "@/context/TouchMode";
import css from "./AppLayout.module.css";

const MIN_WIDTH = 160;

export default function AppLayout() {
  const { isTouch } = useTouchMode();
  const location = useLocation();
  const isRoot = location.pathname === "/";

  const [width, setWidth] = useState(() => {
    const v = localStorage.getItem("sidebarWidth");
    return v !== null ? Number(v) : 240;
  });
  const [visible, setVisible] = useState(() => localStorage.getItem("sidebarVisible") !== "false");

  // ── desktop resize ─────────────────────────────────────────────────────────
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!visible) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [visible]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const w = Math.max(MIN_WIDTH, e.clientX);
    setWidth(w);
    localStorage.setItem("sidebarWidth", String(w));
  }, []);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  // ── toggle ─────────────────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    setVisible((v) => {
      localStorage.setItem("sidebarVisible", String(!v));
      return !v;
    });
  }, []);

  // ── touch swipe-to-open ────────────────────────────────────────────────────
  const swipeStartX = useRef<number | null>(null);

  const onSwipeDown = useCallback((e: React.PointerEvent) => {
    swipeStartX.current = e.clientX;
  }, []);

  const onSwipeMove = useCallback((e: React.PointerEvent) => {
    if (swipeStartX.current === null) return;
    if (e.clientX - swipeStartX.current > 50) {
      toggle();
      swipeStartX.current = null;
    }
  }, [toggle]);

  const onSwipeUp = useCallback(() => { swipeStartX.current = null; }, []);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className={css.shell}>
      <Sidebar
        style={{ width, display: visible ? undefined : "none" }}
        className={isTouch ? css.sidebarOverlay : undefined}
      />

      {isTouch && visible && (
        <div className={css.backdrop} onClick={toggle} />
      )}

      {visible && (
        <div
          className={css.handle}
          style={isTouch ? { position: "fixed", left: width - 10, zIndex: 101 } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

      )}

      {isTouch && (
        <div
          className={css.swipeZone}
          style={visible ? { zIndex: 103 } : undefined}
          onPointerDown={onSwipeDown}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeUp}
          onPointerLeave={onSwipeUp}
        />
      )}

      <button className={css.sidebarBtn} onClick={toggle} title={visible ? "Close sidebar" : "Open sidebar"}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="1.5" y="2.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.5 2.5v13" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      <main className={css.main}>
        {isRoot ? (
          <div className={css.welcome}>
            <span>Select a note or document from the sidebar</span>
            <span className={css.welcomeHint}>or create a notebook to get started</span>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
