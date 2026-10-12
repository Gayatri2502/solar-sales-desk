import React from "react";
import { createRoot } from "react-dom/client";
import PublicSite from "./components/PublicSite";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PublicSite />
  </React.StrictMode>,
);
