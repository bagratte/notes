import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const stored = localStorage.getItem("touchMode");
const touchOn = stored !== null ? stored === "true" : navigator.maxTouchPoints > 0;
if (touchOn) document.documentElement.classList.add("has-touch");
if (stored === null) localStorage.setItem("touchMode", String(touchOn));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
