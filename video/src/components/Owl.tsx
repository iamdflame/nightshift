import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

export type OwlKind = "anchor" | "echo" | "nfv";

const PALETTE: Record<OwlKind, { body: string; dark: string; belly: string; disc: string }> = {
  anchor: { body: "#4A8CF0", dark: "#2F5FB0", belly: "#BCD3FA", disc: "#DCE8FD" },
  echo: { body: "#0FA37F", dark: "#0A6E56", belly: "#A9E6D5", disc: "#D3F3EA" },
  nfv: { body: "#D66A98", dark: "#9E4670", belly: "#F3C6D9", disc: "#FAE3EC" },
};

/**
 * A night-shift owl: blinks, breathes, bobs, flaps; holds its prop (Anchor: Friday's close card, Echo: headphones,
 * NFV: a telescope) and, when asked, a sealed envelope. Flat vector, brand colours.
 */
export function Owl({
  kind,
  size = 260,
  phase = 0,
  mood = "calm",
  envelope = false,
  flap = 0,
  lookX = 0,
}: {
  kind: OwlKind;
  size?: number;
  phase?: number;
  mood?: "calm" | "happy" | "worried";
  envelope?: boolean;
  flap?: number;
  lookX?: number;
}) {
  const frame = useCurrentFrame() + phase;
  const { fps } = useVideoConfig();
  const p = PALETTE[kind];
  const t = frame / fps;
  const bob = Math.sin(t * Math.PI * 0.9) * 3.5;
  const breathe = 1 + Math.sin(t * Math.PI * 0.9 + 1) * 0.012;
  // Blink for 5 frames every ~3.4 s (offset per owl).
  const cycle = (frame + phase * 7) % Math.round(fps * 3.4);
  const blink = cycle < 5 ? interpolate(cycle, [0, 2, 5], [0, 1, 0]) : 0;
  const wing = Math.sin(t * Math.PI * 7) * 18 * flap;
  const pupil = Math.max(-1, Math.min(1, lookX)) * 5;
  const lid = mood === "happy" ? 0.2 : mood === "worried" ? 0.25 : 0;

  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 200 240" style={{ overflow: "visible" }}>
      <g transform={`translate(0 ${bob}) translate(100 230) scale(${breathe}) translate(-100 -230)`}>
        {/* shadow */}
        <ellipse cx="100" cy="232" rx="54" ry="7" fill="#000" opacity="0.28" />
        {/* tufts */}
        <path d="M52 62 L44 22 L78 50 Z" fill={p.dark} />
        <path d="M148 62 L156 22 L122 50 Z" fill={p.dark} />
        {/* wings (behind body) */}
        <g transform={`rotate(${-wing} 46 120)`}>
          <path d="M46 105 C 12 130, 14 190, 44 210 C 50 175, 54 140, 58 112 Z" fill={p.dark} />
        </g>
        <g transform={`rotate(${wing} 154 120)`}>
          <path d="M154 105 C 188 130, 186 190, 156 210 C 150 175, 146 140, 142 112 Z" fill={p.dark} />
        </g>
        {/* body */}
        <path d="M100 38 C 158 38, 176 92, 172 150 C 168 202, 138 226, 100 226 C 62 226, 32 202, 28 150 C 24 92, 42 38, 100 38 Z" fill={p.body} />
        {/* belly + feather chevrons */}
        <path d="M100 118 C 136 118, 146 160, 140 192 C 134 214, 118 222, 100 222 C 82 222, 66 214, 60 192 C 54 160, 64 118, 100 118 Z" fill={p.belly} />
        {[0, 1, 2].map((r) =>
          [-1, 0, 1].map((cIdx) => (
            <path key={`${r}${cIdx}`} d={`M${100 + cIdx * 18 - 6} ${150 + r * 20} q6 7 12 0`} stroke={p.body} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55" />
          )),
        )}
        {/* face discs */}
        <circle cx="74" cy="98" r="33" fill={p.disc} />
        <circle cx="126" cy="98" r="33" fill={p.disc} />
        {/* eyes */}
        {[74, 126].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="98" r="22" fill="#fff" />
            <circle cx={cx + pupil} cy="99" r="12" fill={C.night0} />
            <circle cx={cx + pupil + 4} cy="94" r="4" fill="#fff" />
            {/* lids: blink and mood */}
            <rect x={cx - 24} y={74} width="48" height={48 * Math.max(blink, lid)} fill={p.disc} rx="6" />
            {mood === "worried" && <path d={`M${cx - 18} ${cx < 100 ? 70 : 76} L${cx + 18} ${cx < 100 ? 76 : 70}`} stroke={p.dark} strokeWidth="5" strokeLinecap="round" />}
          </g>
        ))}
        {/* beak */}
        <path d="M100 112 L111 126 L100 140 L89 126 Z" fill="#E7A95A" />
        {/* feet */}
        {[84, 116].map((x) => (
          <g key={x} fill="#E7A95A">
            <circle cx={x - 6} cy="226" r="4.5" />
            <circle cx={x} cy="228" r="4.5" />
            <circle cx={x + 6} cy="226" r="4.5" />
          </g>
        ))}
        {/* props */}
        {kind === "echo" && (
          <g>
            <path d="M34 92 C 34 30, 166 30, 166 92" stroke={C.night1} strokeWidth="9" fill="none" strokeLinecap="round" />
            <rect x="20" y="82" width="22" height="38" rx="9" fill={C.night1} />
            <rect x="158" y="82" width="22" height="38" rx="9" fill={C.night1} />
            <rect x="25" y="88" width="12" height="26" rx="5" fill={p.belly} />
            <rect x="163" y="88" width="12" height="26" rx="5" fill={p.belly} />
          </g>
        )}
        {kind === "nfv" && (
          <g transform="rotate(-28 160 150)">
            <rect x="146" y="120" width="70" height="20" rx="6" fill={C.night1} />
            <rect x="206" y="116" width="16" height="28" rx="5" fill={C.moon2} />
            <rect x="150" y="124" width="22" height="12" rx="3" fill={C.moon3} />
          </g>
        )}
        {kind === "anchor" && !envelope && (
          <g transform="rotate(-8 100 180)">
            <rect x="62" y="160" width="76" height="46" rx="6" fill={C.moon0} />
            <text x="100" y="181" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontSize="13" fill={C.night2}>
              Friday's
            </text>
            <text x="100" y="198" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontSize="13" fill={C.night0} fontWeight="600">
              close
            </text>
          </g>
        )}
        {envelope && (
          <g transform="rotate(-6 100 186)">
            <rect x="60" y="164" width="80" height="50" rx="5" fill={C.moon0} />
            <path d="M60 168 L100 194 L140 168" stroke={C.moon3} strokeWidth="2.5" fill="none" />
            <circle cx="100" cy="194" r="9" fill={C.sodium} />
            <path d="M96 194 l3 3 l6 -7" stroke={C.night0} strokeWidth="2" fill="none" />
          </g>
        )}
      </g>
    </svg>
  );
}
