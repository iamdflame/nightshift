import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Layout } from "@/components/shell/Layout";
import { PageLoader } from "@/components/ui/PageLoader";

const Landing = lazy(() => import("@/pages/Landing"));
const Radar = lazy(() => import("@/pages/Radar"));
const Stock = lazy(() => import("@/pages/Stock"));
const Proof = lazy(() => import("@/pages/Proof"));
const Scoreboard = lazy(() => import("@/pages/Scoreboard"));
const Verify = lazy(() => import("@/pages/Verify"));
const Credits = lazy(() => import("@/pages/Credits"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="radar" element={<Radar />} />
          <Route path="s/:symbol" element={<Stock />} />
          <Route path="proof" element={<Proof />} />
          <Route path="scoreboard" element={<Scoreboard />} />
          <Route path="verify" element={<Verify />} />
          <Route path="credits" element={<Credits />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
