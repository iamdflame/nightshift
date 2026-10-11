import { AbsoluteFill } from "remotion";
import { Owl } from "./components/Owl";
import { Night } from "./components/ui";
import { C, F } from "./theme";

/** YouTube thumbnail (1280×720): the headline, the three owls, the mark. */
export function Thumbnail() {
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <div style={{ transform: "scale(0.6667)", transformOrigin: "0 0", width: 1920, height: 1080 }}>
        <Night seed={42} density={320} />
      </div>
      <svg width="1280" height="720" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="tm">
            <rect width="1280" height="720" fill="#fff" />
            <circle cx={1150} cy={100} r={66} fill="#000" />
          </mask>
          <radialGradient id="th">
            <stop offset="0.5" stopColor="rgba(244,241,232,0.12)" />
            <stop offset="1" stopColor="rgba(244,241,232,0)" />
          </radialGradient>
        </defs>
        <circle cx={1120} cy={118} r={150} fill="url(#th)" />
        <circle cx={1120} cy={118} r={70} fill={C.moon0} mask="url(#tm)" />
      </svg>
      <div style={{ position: "absolute", left: 64, top: 70, width: 760 }}>
        <div style={{ fontFamily: F.sans, fontSize: 30, color: C.sodium, fontWeight: 600 }}>Live on BNB Chain</div>
        <div style={{ fontFamily: F.display, fontSize: 92, lineHeight: 1.0, color: C.moon0, letterSpacing: "-0.03em", marginTop: 14, fontWeight: 400 }}>
          The price of a stock when Wall Street is asleep.
        </div>
      </div>
      <div style={{ position: "absolute", right: 30, bottom: 26, display: "flex", alignItems: "flex-end" }}>
        <Owl kind="anchor" size={150} phase={4} />
        <Owl kind="echo" size={175} phase={21} />
        <Owl kind="nfv" size={150} phase={40} />
      </div>
      <div style={{ position: "absolute", left: 64, bottom: 54, display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="54" height="54" viewBox="0 0 32 32">
          <defs>
            <mask id="tmk">
              <rect width="32" height="32" fill="#fff" />
              <circle cx="21" cy="12.5" r="11" fill="#000" />
            </mask>
          </defs>
          <circle cx="15" cy="16" r="12" fill={C.moon0} mask="url(#tmk)" />
          <circle cx="25.6" cy="21.2" r="2.4" fill={C.sodium} />
        </svg>
        <span style={{ fontFamily: F.wordmark, fontSize: 60, color: C.moon0 }}>Nightshift</span>
      </div>
    </AbsoluteFill>
  );
}
