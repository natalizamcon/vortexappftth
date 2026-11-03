import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/auth";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><AppProvider><App /></AppProvider></React.StrictMode>);

// Permite "Agregar a la pantalla de inicio" en el celular (solo en el sitio publicado).
if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
