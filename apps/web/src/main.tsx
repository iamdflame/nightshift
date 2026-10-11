import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/app/App";
import "@/styles/fonts.css";
import "@/styles/app.css";

// A redeploy replaces hashed chunks: reload once instead of showing a broken page.
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("ns-reloaded")) {
    sessionStorage.setItem("ns-reloaded", "1");
    window.location.reload();
  }
});

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
