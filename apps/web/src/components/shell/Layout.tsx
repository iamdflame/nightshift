import { Outlet, useLocation } from "react-router";
import { useEffect } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="relative min-h-svh">
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
