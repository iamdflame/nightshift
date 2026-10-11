import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import data from "../data.json";
import { Broll, Card, Counter, Kicker, Kinetic, Mono, Night, Rise, Screen, usd, useIn } from "../components/ui";
import { C, F } from "../theme";

/** A sub-shot inside a scene: its own frame clock, with a short fade at each end. */
export function Shot({ from, to, children, fadeIn = 10, fadeOut = 10 }: { from: number; to: number; children: ReactNode; fadeIn?: number; fadeOut?: number }) {
  return (
    <Sequence from={from} durationInFrames={Math.max(1, to - from)}>
      <Fade len={to - from} fadeIn={fadeIn} fadeOut={fadeOut}>
        {children}
      </Fade>
    </Sequence>
  );
}
function Fade({ len, fadeIn, fadeOut, children }: { len: number; fadeIn: number; fadeOut: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const o = Math.min(fadeIn ? interpolate(f, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1, fadeOut ? interpolate(f, [len - fadeOut, len], [1, 0], { extrapolateLeft: "clamp" }) : 1);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

const at = (dur: number, x: number) => Math.round(dur * x);

// ── S1 · Cold open ──────────────────────────────────────────────────────────────────────────────
export function S1({ dur }: { dur: number }) {
  const a = at(dur, 0.3);
  const b = at(dur, 0.58);
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Broll src="broll/hd/moon.mp4" zoom={[1.02, 1.1]} scrim={0.25} />
        <AbsoluteFill style={{ padding: "0 140px", justifyContent: "center" }}>
          <Rise at={6}>
            <Mono size={30} color={C.sodium}>
              Saturday, 10:00 p.m. ET
            </Mono>
          </Rise>
          <Kinetic text="Wall Street is asleep." at={20} size={120} style={{ marginTop: 26 }} />
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={b + 8}>
        <Broll src="broll/hd/city-night.mp4" zoom={[1.08, 1.0]} scrim={0.3} />
        <AbsoluteFill style={{ padding: "0 140px", justifyContent: "flex-end", paddingBottom: 220 }}>
          <Kinetic text="On BNB Chain, NVIDIA still trades." at={6} size={92} />
          <Rise at={30} style={{ marginTop: 18 }}>
            <span style={{ fontFamily: F.sans, fontSize: 34, color: C.moon1 }}>Lenders still lend against it.</span>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={b} to={dur} fadeOut={0}>
        <Screen src="capture/hero.mp4" from={30} frame={false} focus={[[0, 1.18, 30, 30], [dur - b, 1.0, 50, 50]]} />
        <Question at={at(dur, 0.84) - b} />
      </Shot>
    </AbsoluteFill>
  );
}
function Question({ at: start }: { at: number }) {
  const v = useIn(start, 22);
  return (
    <AbsoluteFill style={{ background: `rgba(10,15,30,${0.72 * v})`, alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: v, transform: `scale(${0.96 + v * 0.04})`, textAlign: "center" }}>
        <div style={{ fontFamily: F.sans, fontSize: 32, color: C.sodium, marginBottom: 18 }}>The question nobody can answer</div>
        <div style={{ fontFamily: F.display, fontSize: 116, fontWeight: 300, color: C.moon0, letterSpacing: "-0.03em" }}>What is it actually worth?</div>
      </div>
    </AbsoluteFill>
  );
}

// ── S2 · The dark weekend ───────────────────────────────────────────────────────────────────────
/** One cell per half hour of a US week (Mon→Sun, ET); regular sessions lit. */
function WeekBar({ start }: { start: number }) {
  const f = useCurrentFrame();
  const cells = 336;
  const W = 1560;
  const cw = W / cells;
  const lit = (i: number) => {
    const day = Math.floor(i / 48);
    const h = (i % 48) / 2;
    return day < 5 && h >= 9.5 && h < 16;
  };
  const sweep = interpolate(f, [start, start + 70], [0, cells], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wk = interpolate(f, [start + 80, start + 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const friClose = 4 * 48 + 32;
  const monOpen = 7 * 48 + 19; // next Monday 09:30, drawn past the end
  return (
    <div style={{ width: W, position: "relative" }}>
      <svg width={W} height={130} style={{ overflow: "visible" }}>
        {Array.from({ length: cells }).map((_, i) => (
          <rect key={i} x={i * cw} y={20} width={Math.max(1, cw - 1)} height={70} rx={1} fill={i < sweep ? (lit(i) ? C.moon0 : "rgba(160,180,220,0.13)") : "rgba(160,180,220,0.04)"} />
        ))}
        {days.map((d, i) => (
          <text key={d} x={i * 48 * cw + 6} y={118} fontFamily="'Instrument Sans'" fontSize={22} fill={C.moon2}>
            {d}
          </text>
        ))}
        <g opacity={wk}>
          <rect x={friClose * cw} y={6} width={(Math.min(cells, monOpen) - friClose) * cw} height={98} rx={6} fill="none" stroke={C.sodium} strokeWidth={3} />
          <text x={friClose * cw + 10} y={0} fontFamily="'Martian Mono'" fontSize={20} fill={C.sodium}>
            Fri 16:00 → Mon 09:30: 65.5 h dark
          </text>
        </g>
      </svg>
    </div>
  );
}

export function S2({ dur }: { dur: number }) {
  const a = at(dur, 0.42);
  const b = at(dur, 0.62);
  const c = at(dur, 0.8);
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Broll src="broll/hd/earth-at-night.mp4" from={60} zoom={[1.22, 1.3]} scrim={0.45} />
        <AbsoluteFill style={{ padding: "110px 180px", justifyContent: "space-between" }}>
          <div>
            <Kicker at={4}>The dark weekend</Kicker>
            <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 14 }}>
              <Counter to={168} at={8} dur={36} size={150} />
              <span style={{ fontFamily: F.display, fontSize: 64, color: C.moon1 }}>hours in a week.</span>
            </div>
            <Rise at={46} style={{ marginTop: 8 }}>
              <span style={{ fontFamily: F.display, fontSize: 64, color: C.moon0 }}>
                The market prices <span style={{ color: C.sodium }}>32.5</span> of them.
              </span>
            </Rise>
          </div>
          <WeekBar start={20} />
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={b + 8}>
        <Night seed={3} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
            <Counter to={62} at={4} dur={34} size={300} color={C.sodium} />
            <span style={{ fontFamily: F.mono, fontSize: 160, color: C.sodium, fontWeight: 300 }}>%</span>
          </div>
          <Rise at={24}>
            <div style={{ fontFamily: F.display, fontSize: 60, color: C.moon0, maxWidth: 1300 }}>of bStocks' July volume traded while US markets were closed.</div>
          </Rise>
          <Rise at={40} style={{ marginTop: 22 }}>
            <span style={{ fontFamily: F.sans, fontSize: 26, color: C.moon3 }}>Crypto Briefing, Aug 26 2026</span>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={b} to={c + 8}>
        <Night seed={4} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Kicker at={2} color={C.moon2}>
            When the market closes, the reference goes quiet
          </Kicker>
          <Typed text="“These feeds do not publish updates, including heartbeat updates, while markets are closed.”" at={10} />
          <Rise at={50} style={{ marginTop: 26 }}>
            <span style={{ fontFamily: F.sans, fontSize: 28, color: C.moon3 }}>Chainlink, tokenized-equity feed docs</span>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={c} to={dur} fadeOut={0}>
        <Screen src="capture/weekend.mp4" from={390} rate={3.6} focus={[[0, 1.0, 30, 40], [dur - c, 1.06, 30, 30]]} />
      </Shot>
    </AbsoluteFill>
  );
}

function Typed({ text, at: start }: { text: string; at: number }) {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [start, start + text.length * 0.9], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div style={{ fontFamily: F.display, fontSize: 72, fontWeight: 300, color: C.moon0, maxWidth: 1480, textAlign: "center", marginTop: 24, lineHeight: 1.15 }}>
      {text.slice(0, n)}
      <span style={{ opacity: f % 30 < 15 ? 1 : 0, color: C.sodium }}>|</span>
    </div>
  );
}

// ── S3 · What a lender reads ────────────────────────────────────────────────────────────────────
function Band({ lower, upper, fair, start }: { lower: number; upper: number; fair: number; start: number }) {
  const v = useIn(start, 26);
  const pad = (upper - lower) * 0.35;
  const lo = lower - pad;
  const hi = upper + pad;
  const x = (p: number) => ((p - lo) / (hi - lo)) * 100;
  return (
    <div style={{ position: "relative", height: 70, marginTop: 26 }}>
      <div style={{ position: "absolute", left: `${x(lower)}%`, width: `${(x(upper) - x(lower)) * v}%`, top: 18, height: 30, borderRadius: 8, background: "rgba(255,178,63,0.22)", border: `2px solid ${C.sodium}` }} />
      <div style={{ position: "absolute", left: `${x(fair)}%`, top: 8, width: 3, height: 50, background: C.sodium, opacity: v }} />
      <div style={{ position: "absolute", left: `${x(lower)}%`, top: 54, transform: "translateX(-50%)", opacity: v }}>
        <Mono size={20} color={C.moon2}>{usd(lower)}</Mono>
      </div>
      <div style={{ position: "absolute", left: `${x(upper)}%`, top: 54, transform: "translateX(-50%)", opacity: v }}>
        <Mono size={20} color={C.moon2}>{usd(upper)}</Mono>
      </div>
    </div>
  );
}

export function S3({ dur }: { dur: number }) {
  const a = at(dur, 0.64);
  const f = useCurrentFrame();
  const w = data.backtest.weekendDark;
  const bars = interpolate(f, [at(dur, 0.36), at(dur, 0.36) + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Night seed={5} />
        <AbsoluteFill style={{ padding: "90px 140px" }}>
          <Kicker at={2}>What a lender reads tonight</Kicker>
          <Rise at={8} style={{ marginTop: 14 }}>
            <Mono size={46} color={C.moon0}>
              getPrice(<span style={{ color: C.sodium }}>NVDAB</span>)
            </Mono>
            <span style={{ fontFamily: F.sans, fontSize: 30, color: C.moon2, marginLeft: 24 }}>the same call, asked of two contracts on BNB Chain</span>
          </Rise>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 44 }}>
            <Rise at={18}>
              <Card>
                <div style={{ fontFamily: F.sans, fontSize: 30, color: C.moon1 }}>Venus</div>
                <div style={{ fontFamily: F.sans, fontSize: 22, color: C.moon3 }}>ResilientOracle, the token's own trading price</div>
                <div style={{ marginTop: 22 }}>
                  <Mono size={92} color={C.moon0}>{usd(data.venus.price)}</Mono>
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 28, color: C.moon2, marginTop: 10 }}>One number. No view of the open.</div>
              </Card>
            </Rise>
            <Rise at={34}>
              <Card style={{ borderColor: "rgba(255,178,63,0.45)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 30, color: C.moon1 }}>Nightshift</div>
                <div style={{ fontFamily: F.sans, fontSize: 22, color: C.moon3 }}>Venus-compatible adapter, fair value for the next open</div>
                <div style={{ marginTop: 22 }}>
                  <Mono size={92} color={C.moon0}>{usd(data.nightshift.fairValue)}</Mono>
                </div>
                <Band lower={data.nightshift.lower} upper={data.nightshift.upper} fair={data.nightshift.fairValue} start={50} />
                <div style={{ fontFamily: F.sans, fontSize: 28, color: C.moon2, marginTop: 4 }}>And a 90% range for the gap.</div>
              </Card>
            </Rise>
          </div>
          <Rise at={at(dur, 0.34)} style={{ marginTop: 44 }}>
            <div style={{ fontFamily: F.sans, fontSize: 28, color: C.moon1, marginBottom: 14 }}>Every dark weekend since June: error at Monday's open (bps, our backtest)</div>
            {[
              ["The token's own price", w.echo, C.moon2],
              ["Friday's close, held", w.stale, C.moon3],
            ].map(([label, v, color]) => (
              <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10 }}>
                <span style={{ width: 360, fontFamily: F.sans, fontSize: 26, color: C.moon2 }}>{label}</span>
                <div style={{ height: 30, width: ((v as number) / 180) * 1080 * bars, background: color as string, borderRadius: 6 }} />
                <Mono size={26}>{(v as number).toFixed(1)}</Mono>
              </div>
            ))}
            <Rise at={at(dur, 0.5)} style={{ marginTop: 18 }}>
              <span style={{ fontFamily: F.display, fontSize: 48, color: C.sodium }}>Barely better. And no error bar.</span>
            </Rise>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={dur} fadeOut={0}>
        <Screen src="capture/venus.mp4" from={570} focus={[[0, 1.12, 50, 44], [dur - a, 1.32, 50, 46]]} />
      </Shot>
    </AbsoluteFill>
  );
}
