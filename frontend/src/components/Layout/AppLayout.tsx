import { useRef, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import css from "./AppLayout.module.css";

const MIN_WIDTH = 160;

const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export default function AppLayout() {
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
      setVisible(true);
      localStorage.setItem("sidebarVisible", "true");
      swipeStartX.current = null;
    }
  }, []);

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

      {!isTouch && (
        <div
          className={css.handle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <button
            className={css.toggleBtn}
            onClick={toggle}
            onPointerDown={(e) => e.stopPropagation()}
            title={visible ? "Hide sidebar" : "Show sidebar"}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
              {visible
                ? <path d="M7 1L2 7l5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M3 1l5 6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              }
            </svg>
          </button>
        </div>
      )}

      {isTouch && !visible && (
        <div
          className={css.swipeZone}
          onPointerDown={onSwipeDown}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeUp}
          onPointerLeave={onSwipeUp}
        />
      )}

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
