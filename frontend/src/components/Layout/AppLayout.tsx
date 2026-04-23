import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import css from "./AppLayout.module.css";

export default function AppLayout() {
  const location = useLocation();
  const isRoot = location.pathname === "/";

  return (
    <div className={css.shell}>
      <Sidebar />
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
