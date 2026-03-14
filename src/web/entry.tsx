import { browserApi } from "./browserApi";

// Assign browser shim before any component imports access window.appApi
window.appApi = browserApi;

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../components/App";
import "katex/dist/katex.min.css";
import "../index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
