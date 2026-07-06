import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/500.css";
import "@fontsource/noto-sans-tc/600.css";
import "@fontsource/noto-sans-tc/700.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
