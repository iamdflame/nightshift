import { useSyncExternalStore } from "react";

/** One aligned 1 s ticker for the whole app (countdowns, clocks), paused while the tab is hidden. */
let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function tick() {
  now = Date.now();
  for (const s of subs) s();
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) tick();
  const onVis = () => {
    if (document.visibilityState === "visible") {
      now = Date.now();
      cb();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    subs.delete(cb);
    document.removeEventListener("visibilitychange", onVis);
    if (subs.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export const useNow = () => useSyncExternalStore(subscribe, () => now, () => now);
