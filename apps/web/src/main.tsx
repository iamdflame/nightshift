import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App, preloadLanding } from "@/app/App";
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

const start = () =>
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

// On "/", index.html already painted the hero: load the home page first so React's first commit replaces it
// in place. A promise, not top-level await: the Landing chunk imports from this one, so awaiting it here deadlocks.
if (window.location.pathname === "/") preloadLanding().then(start, start);
else start();
