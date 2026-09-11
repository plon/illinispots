import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "@/client/styles.css";
import { initializeClientObservability } from "@/client/observability";
import { Providers } from "@/client/providers";
import { router } from "@/client/router";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root application element");
}

initializeClientObservability(router);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
);
