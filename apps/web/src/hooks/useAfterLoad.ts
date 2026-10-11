import { useEffect, useState } from "react";

/**
 * True once the page has loaded and the main thread is idle: heavy extras (the WebGL sky, the story
 * chapters and their textures) start after the headline has painted instead of competing with it.
 */
export function useAfterLoad(timeout = 1500) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let id = 0;
    const idle = () => {
      const ric = window.requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
      id = ric ? ric(() => setReady(true), { timeout }) : window.setTimeout(() => setReady(true), 200);
    };
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
    return () => {
      window.removeEventListener("load", idle);
      if (window.cancelIdleCallback) window.cancelIdleCallback(id);
      window.clearTimeout(id);
    };
  }, [timeout]);
  return ready;
}
