import { startTransition, useEffect, useState } from "react";

/**
 * True once the reader shows they're heading down the page (wheel, touch, a key, a scroll or a #hash), or after
 * `fallbackMs` regardless. The story below the hero (a pinned WebGL chapter and five more) mounts then, so the
 * hero has the main thread to itself while it's the only thing on screen.
 */
export function useScrollIntent(fallbackMs = 12_000) {
  const [go, setGo] = useState(() => typeof window !== "undefined" && (window.scrollY > 0 || window.location.hash.length > 1));
  useEffect(() => {
    if (go) return;
    const events = ["wheel", "touchstart", "keydown", "scroll", "pointerdown"] as const;
    const fire = () => {
      cleanup();
      startTransition(() => setGo(true));
    };
    const timer = window.setTimeout(fire, fallbackMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, fire);
    };
    for (const e of events) window.addEventListener(e, fire, { passive: true, once: true });
    return cleanup;
  }, [go, fallbackMs]);
  return go;
}
