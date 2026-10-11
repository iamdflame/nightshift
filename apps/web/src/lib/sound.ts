/**
 * The one sensory signature: a synthesized opening bell (additive partials of a struck bell) and a
 * soft tick. Web Audio only: no files, no licenses. Off by default; the viewer opts in.
 */
import { useSyncExternalStore } from "react";

let enabled = false;
try {
  enabled = localStorage.getItem("ns-sound") === "on";
} catch {
  /* storage unavailable: stay muted */
}
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem("ns-sound", on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (on) ensure();
  for (const s of subs) s();
}
export const useSound = () =>
  useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => enabled,
    () => false,
  );

function ensure() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A struck bell: inharmonic partials (hum, prime, tierce, quint, nominal) with exponential decay. */
export function ringBell(gain = 0.22) {
  if (!enabled) return;
  const ac = ensure();
  const t0 = ac.currentTime + 0.02;
  const base = 392; // G4
  const partials = [
    [0.5, 0.35, 4.2],
    [1, 0.55, 3.2],
    [1.19, 0.4, 2.6],
    [1.5, 0.25, 2.1],
    [2, 0.45, 1.8],
    [2.74, 0.18, 1.2],
    [3.76, 0.1, 0.8],
  ] as const;
  const out = ac.createGain();
  out.gain.value = gain;
  out.connect(ac.destination);
  for (const [ratio, amp, decay] of partials) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = base * ratio;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + decay + 0.05);
  }
}

/** A soft wooden tick for chapter changes. */
export function tick(gain = 0.05) {
  if (!enabled) return;
  const ac = ensure();
  const t0 = ac.currentTime + 0.005;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(1800, t0);
  o.frequency.exponentialRampToValueAtTime(600, t0 + 0.05);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + 0.1);
}
