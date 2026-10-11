import align from "./align.json";
import { FPS } from "./theme";

/** Frames between the start of a scene and the start of its voice (Main.tsx LEAD). */
export const LEAD = 9;

type Chunk = { text: string; start: number; end: number };
type Scene = { dur: number; speechStart: number; speechEnd: number; chunks: Chunk[]; speech: [number, number][] };
const A = align as unknown as Record<string, Scene | undefined>;

export const aligned = (id: string) => A[id];

/**
 * The frame (inside scene `id`) where the voice starts saying `phrase`, from the measured pauses in the real
 * voice file. Without a voice file, `fallback` × the scene length (the estimate-timed cut).
 */
export function cue(id: string, phrase: string, dur: number, fallback: number): number {
  const s = A[id];
  const c = s?.chunks.find((x) => x.text.toLowerCase().includes(phrase.toLowerCase()));
  if (!s || !c) return Math.round(dur * fallback);
  return LEAD + Math.round(c.start * FPS);
}

/** The caption on screen at scene frame `f`, with the frame it appeared. */
export function captionAt(id: string, f: number): { text: string; from: number } | null {
  const s = A[id];
  if (!s) return null;
  const t = (f - LEAD) / FPS;
  for (let i = 0; i < s.chunks.length; i++) {
    const c = s.chunks[i]!;
    const next = s.chunks[i + 1];
    // hold each caption through the pause that follows it, until the next one starts
    const until = next ? next.start : c.end + 0.5;
    if (t >= c.start - 0.05 && t < until) return { text: c.text, from: LEAD + Math.round(c.start * FPS) };
  }
  return null;
}

/** Is the voice speaking at scene time t (seconds from the scene start)? Used to duck the music. */
export function speaking(id: string, t: number): boolean {
  const s = A[id];
  if (!s) return false;
  const v = t - LEAD / FPS;
  return s.speech.some(([a, b]) => v >= a - 0.12 && v <= b + 0.25);
}
