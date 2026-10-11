import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { aligned, captionAt } from "../cues";
import { captionChunks } from "../script";
import { C, F } from "../theme";

export const ease = Easing.bezier(0.23, 1, 0.32, 1);
export const inOut = Easing.bezier(0.77, 0, 0.175, 1);

/** 0→1 between two frames with the brand ease. */
export function useIn(from: number, dur = 18) {
  const f = useCurrentFrame();
  return interpolate(f, [from, from + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}
export function useOut(at: number, dur = 12) {
  const f = useCurrentFrame();
  return interpolate(f, [at, at + dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

/** Reveal: rises 24px and un-blurs. */
export function Rise({ at, children, style, dur = 20, y = 26 }: { at: number; children: ReactNode; style?: CSSProperties; dur?: number; y?: number }) {
  const v = useIn(at, dur);
  return <div style={{ opacity: v, transform: `translateY(${(1 - v) * y}px)`, filter: `blur(${(1 - v) * 8}px)`, ...style }}>{children}</div>;
}

/** Headline that reveals word by word, like the site's SplitText. */
export function Kinetic({ text, at = 0, size = 96, color = C.moon0, weight = 300, stagger = 3, style }: { text: string; at?: number; size?: number; color?: string; weight?: number; stagger?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ fontFamily: F.display, fontSize: size, fontWeight: weight, color, lineHeight: 1.04, letterSpacing: "-0.025em", ...style }}>
      {words.map((w, i) => {
        const v = interpolate(f, [at + i * stagger, at + i * stagger + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - v) * 105}%)`, opacity: v }}>{w}&nbsp;</span>
          </span>
        );
      })}
    </div>
  );
}

export function Kicker({ children, color = C.sodium, at = 0 }: { children: ReactNode; color?: string; at?: number }) {
  const v = useIn(at, 16);
  return <div style={{ fontFamily: F.sans, fontSize: 30, fontWeight: 500, color, opacity: v, transform: `translateX(${(1 - v) * -16}px)` }}>{children}</div>;
}

export function Mono({ children, size = 28, color = C.moon1, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return <span style={{ fontFamily: F.mono, fontSize: size, color, fontVariantNumeric: "tabular-nums slashed-zero", ...style }}>{children}</span>;
}

/** Counts up from `from` to `to` with the brand ease (used only for live totals, not prices). */
export function Counter({ to, from = 0, at = 0, dur = 40, format = (n: number) => Math.round(n).toLocaleString("en-US"), size = 160, color = C.moon0 }: { to: number; from?: number; at?: number; dur?: number; format?: (n: number) => string; size?: number; color?: string }) {
  const f = useCurrentFrame();
  const v = interpolate(f, [at, at + dur], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return <Mono size={size} color={color} style={{ fontWeight: 300, letterSpacing: "-0.03em" }}>{format(v)}</Mono>;
}

/** Deep night background with real-looking stars that twinkle. */
export function Night({ seed = 1, density = 260, glow = true }: { seed?: number; density?: number; glow?: boolean }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 70% 0%, ${C.night2} 0%, ${C.night0} 62%)` }}>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: density }).map((_, i) => {
          const x = random(`x${seed}${i}`) * 1920;
          const y = random(`y${seed}${i}`) * 1080;
          const r = random(`r${seed}${i}`) ** 3 * 1.8 + 0.4;
          const tw = 0.55 + 0.45 * Math.sin(f / (14 + random(`t${seed}${i}`) * 30) + i);
          return <circle key={i} cx={x} cy={y} r={r} fill={random(`c${seed}${i}`) > 0.93 ? "#FFD9A0" : "#EAF0FF"} opacity={0.25 + 0.6 * tw * random(`o${seed}${i}`)} />;
        })}
      </svg>
      {glow && <AbsoluteFill style={{ background: "radial-gradient(70% 45% at 50% 115%, rgba(255,178,63,0.10), transparent 70%)" }} />}
    </AbsoluteFill>
  );
}

/** Film grain + vignette on top of everything (subtle). */
export function Finish() {
  const f = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)", pointerEvents: "none" }} />
      <AbsoluteFill style={{ opacity: 0.06, mixBlendMode: "overlay", pointerEvents: "none" }}>
        <svg width="1920" height="1080">
          <filter id="g">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 7} />
          </filter>
          <rect width="1920" height="1080" filter="url(#g)" />
        </svg>
      </AbsoluteFill>
    </>
  );
}

/** A full-bleed B-roll clip with a slow push-in and a darkening scrim. */
export function Broll({ src, from = 0, zoom = [1.04, 1.12], scrim = 0.35, rate = 1 }: { src: string; from?: number; zoom?: [number, number]; scrim?: number; rate?: number }) {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = interpolate(f, [0, durationInFrames], zoom);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.night0 }}>
      <OffthreadVideo src={staticFile(src)} startFrom={from} playbackRate={rate} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(10,15,30,${scrim}) 0%, rgba(10,15,30,${scrim * 0.6}) 45%, rgba(10,15,30,${Math.min(0.9, scrim + 0.3)}) 100%)` }} />
    </AbsoluteFill>
  );
}

/**
 * A site recording in a clean browser frame, with a slow camera: `focus` keyframes move and scale the view
 * ([frame, scale, x%, y%]) so the viewer's eye lands on what the voice is talking about.
 */
export function Screen({ src, from = 0, focus = [[0, 1, 50, 50]], url = "nightshift-oracle.vercel.app", frame = true, rate = 1, small = false }: { src: string; from?: number; focus?: [number, number, number, number][]; url?: string; frame?: boolean; rate?: number; small?: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const keys = focus.map((k) => k[0]);
  const pick = (i: 1 | 2 | 3) => (keys.length > 1 ? interpolate(f, keys, focus.map((k) => k[i]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut }) : focus[0]![i]);
  const scale = pick(1);
  const ox = pick(2);
  const oy = pick(3);
  const enter = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: 24 });
  const W = frame ? (small ? 1560 : 1680) : 1920;
  const H = frame ? (small ? 878 : 945) : 1080;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: small ? "flex-end" : "center", paddingBottom: small ? 40 : 0 }}>
      <div
        style={{
          width: W,
          height: H + (frame ? 44 : 0),
          borderRadius: frame ? 18 : 0,
          overflow: "hidden",
          background: C.night1,
          boxShadow: frame ? "0 40px 120px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(160,180,220,0.16)" : undefined,
          transform: `translateY(${(1 - enter) * 40}px) scale(${0.96 + enter * 0.04})`,
          opacity: enter,
        }}
      >
        {frame && (
          <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "#111a30", borderBottom: "1px solid rgba(160,180,220,0.12)" }}>
            {["#FF7A66", "#FFB23F", "#59D98E"].map((c) => (
              <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />
            ))}
            <div style={{ marginLeft: 24, flex: 1, maxWidth: 640, height: 28, borderRadius: 8, background: C.night0, display: "flex", alignItems: "center", padding: "0 14px", fontFamily: F.sans, fontSize: 15, color: C.moon2 }}>
              <span style={{ color: C.up, marginRight: 8 }}>●</span>
              {url}
            </div>
          </div>
        )}
        <div style={{ width: W, height: H, overflow: "hidden", position: "relative" }}>
          <OffthreadVideo
            src={staticFile(src)}
            startFrom={from}
            playbackRate={rate}
            muted
            style={{ width: W, height: H, objectFit: "cover", transform: `scale(${scale})`, transformOrigin: `${ox}% ${oy}%` }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Burned-in captions for muted viewing: chunks spread across the scene in proportion to their length. */
export function Captions({ id, vo, dur, lead = 8, tail = 14 }: { id: string; vo: string; dur: number; lead?: number; tail?: number }) {
  const f = useCurrentFrame();
  // With a voice file: the measured timings of each sentence. Without: chunks spread by length.
  const measured = captionAt(id, f);
  const span = Math.max(1, dur - lead - tail);
  const chunks = captionChunks(vo);
  const now = (f - lead) / span;
  const est = chunks.find((x) => now >= x.from && now < x.to) ?? (now >= 1 ? chunks.at(-1) : undefined);
  const c = measured ?? (est && f >= lead ? { text: est.text, from: lead + est.from * span } : null);
  if (!c || (aligned(id) && !measured)) return null;
  const local = f - c.from;
  const v = interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 54, pointerEvents: "none" }}>
      <div style={{ maxWidth: 1360, padding: "12px 26px", borderRadius: 12, background: "rgba(8,12,24,0.72)", backdropFilter: "blur(8px)", fontFamily: F.sans, fontSize: 36, lineHeight: 1.3, color: C.moon0, textAlign: "center", opacity: v, transform: `translateY(${(1 - v) * 6}px)` }}>
        {c.text}
      </div>
    </AbsoluteFill>
  );
}

/** A small rounded label with a coloured dot. */
export function Tag({ color, children, size = 26 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, background: "rgba(21,30,53,0.85)", border: `1px solid ${C.rule}`, fontFamily: F.sans, fontSize: size, color: C.moon1 }}>
      <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: color }} />
      {children}
    </span>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "rgba(21,30,53,0.88)", border: `1px solid ${C.rule}`, borderRadius: 22, padding: 36, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.7)", ...style }}>{children}</div>;
}

export const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const short = (h: string, a = 6, b = 4) => `${h.slice(0, a)}…${h.slice(-b)}`;
