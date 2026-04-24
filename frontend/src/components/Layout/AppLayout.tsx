import { useRef, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import css from "./AppLayout.module.css";

const MIN_WIDTH = 160;

export default function AppLayout() {
  const location = useLocation();
  const isRoot = location.pathname === "/";

  const [width, setWidth] = useState(() => {
    const v = localStorage.getItem("sidebarWidth");
    return v !== null ? Number(v) : 240;
  });
  const [visible, setVisible] = useState(() => localStorage.getItem("sidebarVisible") !== "false");
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

  const toggle = useCallback(() => {
    setVisible((v) => {
      localStorage.setItem("sidebarVisible", String(!v));
      return !v;
    });
  }, []);

  return (
    <div className={css.shell}>
      <Sidebar style={{ width, display: visible ? undefined : "none" }} />
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
