import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import data from "../data.json";
import { Owl, type OwlKind } from "../components/Owl";
import { Broll, Card, Counter, Kicker, Kinetic, Mono, Night, Rise, Screen, Tag, usd, useIn } from "../components/ui";
import { cue } from "../cues";
import { C, F } from "../theme";
import { Shot } from "./Act1";

const at = (dur: number, x: number) => Math.round(dur * x);
const OWLS: { kind: OwlKind; name: string; role: string; id: number; color: string }[] = [
  { kind: "anchor", name: "Anchor", role: "holds Friday's close", id: 370891, color: C.anchor },
  { kind: "echo", name: "Echo", role: "listens to the live market", id: 370892, color: C.echo },
  { kind: "nfv", name: "NFV", role: "our model, reads every signal", id: 370893, color: C.nfv },
];

/** A thin crescent and a skyline: the stage the owls stand on. */
function Stage() {
  const f = useCurrentFrame();
  return (
    <>
      <Night seed={8} density={300} />
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="cres">
            <rect width="1920" height="1080" fill="#fff" />
            <circle cx={1650} cy={170} r={86} fill="#000" />
          </mask>
        </defs>
        <radialGradient id="halo">
          <stop offset="0.55" stopColor="rgba(244,241,232,0.10)" />
          <stop offset="1" stopColor="rgba(244,241,232,0)" />
        </radialGradient>
        <circle cx={1610} cy={190} r={190} fill="url(#halo)" />
        <circle cx={1610} cy={190} r={92} fill={C.moon0} mask="url(#cres)" opacity={0.95} />
        {Array.from({ length: 34 }).map((_, i) => {
          const w = 40 + ((i * 37) % 70);
          const h = 90 + ((i * 53) % 220);
          const x = i * 58 - 20;
          return (
            <g key={i}>
              <rect x={x} y={1080 - h} width={w} height={h} fill="#0C1326" />
              {Array.from({ length: Math.floor(h / 26) }).map((_, j) =>
                (i * 7 + j * 3 + Math.floor(f / 45)) % 5 === 0 ? <rect key={j} x={x + 8 + (j % 2) * 16} y={1080 - h + 12 + j * 26} width={8} height={10} fill="rgba(255,178,63,0.55)" /> : null,
              )}
            </g>
          );
        })}
        <rect x={0} y={880} width={1920} height={200} fill="url(#ledge)" />
        <linearGradient id="ledge" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0A0F1E" stopOpacity="0" />
          <stop offset="1" stopColor="#0A0F1E" stopOpacity="1" />
        </linearGradient>
      </svg>
    </>
  );
}

/** ForecastBook as a vault on BNB Chain that takes the sealed envelopes. */
function Vault({ glow }: { glow: number }) {
  return (
    <div style={{ width: 420, height: 230, borderRadius: 26, background: "linear-gradient(180deg,#1D2843,#151E35)", border: `2px solid rgba(255,178,63,${0.25 + glow * 0.6})`, boxShadow: `0 0 ${40 + glow * 80}px rgba(255,178,63,${0.12 + glow * 0.3})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke={C.sodium} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <circle cx="12" cy="15.5" r="1.6" fill={C.sodium} />
      </svg>
      <div style={{ fontFamily: F.sans, fontSize: 34, color: C.moon0 }}>ForecastBook</div>
      <Mono size={18} color={C.moon2}>
        on BNB Chain, 0xa04f…3212
      </Mono>
    </div>
  );
}

// ── S4 · Meet the night shift ───────────────────────────────────────────────────────────────────
export function S4({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sealAt = cue("s4", "Every 30 minutes", dur, 0.42) + 20;
  const lockAt = cue("s4", "Once it's sealed", dur, 0.8) - 4;
  const named = [cue("s4", "Anchor holds", dur, 0.2) - 8, cue("s4", "Echo listens", dur, 0.27) - 8, cue("s4", "And NFV", dur, 0.34) - 8];
  const xs = [520, 960, 1400];
  const glow = interpolate(f, [sealAt + 40, sealAt + 60, sealAt + 75], [0, 1, 0.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Stage />
      <AbsoluteFill style={{ padding: "80px 140px", opacity: interpolate(f, [lockAt - 10, lockAt], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Kicker at={2}>Meet the night shift</Kicker>
        <Kinetic text="Three forecasters, each with its own on-chain identity." at={8} size={64} style={{ maxWidth: 1100, marginTop: 10 }} />
      </AbsoluteFill>
      {f >= sealAt - 20 && (
        <div style={{ position: "absolute", left: 750, top: 300, opacity: interpolate(f, [sealAt - 20, sealAt], [0, 1], { extrapolateRight: "clamp" }) }}>
          <Vault glow={glow} />
        </div>
      )}
      {OWLS.map((o, i) => {
        const enter = spring({ frame: f - named[i]!, fps, config: { damping: 13, stiffness: 120 } });
        const fly = interpolate(f, [sealAt + i * 8, sealAt + 36 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const holding = f > sealAt - 60 && fly < 1;
        // envelope flight from the owl to the vault
        const ex = interpolate(fly, [0, 1], [xs[i]!, 960]);
        const ey = interpolate(fly, [0, 0.5, 1], [690, 520, 420]);
        return (
          <div key={o.kind}>
            <div style={{ position: "absolute", left: xs[i]! - 130, top: 470 + (1 - enter) * 500, opacity: enter }}>
              <Owl kind={o.kind} size={260} phase={i * 23} envelope={holding && fly === 0} flap={fly > 0 && fly < 1 ? 1 : 0} mood={f > lockAt ? "happy" : "calm"} lookX={fly > 0 ? (960 - xs[i]!) / 400 : 0} />
            </div>
            <div style={{ position: "absolute", left: xs[i]! - 210, width: 420, top: 800, textAlign: "center", opacity: enter }}>
              <Tag color={o.color} size={24}>
                {o.name} <Mono size={20} color={C.moon2}>ERC-8004 #{o.id}</Mono>
              </Tag>
              <div style={{ fontFamily: F.sans, fontSize: 22, color: C.moon2, marginTop: 8 }}>{o.role}</div>
            </div>
            {fly > 0 && fly < 1 && (
              <svg style={{ position: "absolute", left: ex - 40, top: ey - 26 }} width="80" height="52" viewBox="0 0 80 52">
                <rect x="0" y="0" width="80" height="52" rx="5" fill={C.moon0} />
                <path d="M0 4 L40 30 L80 4" stroke={C.moon3} strokeWidth="2.5" fill="none" />
                <circle cx="40" cy="30" r="9" fill={C.sodium} />
              </svg>
            )}
          </div>
        );
      })}
      {f >= sealAt && (
        <div style={{ position: "absolute", right: 120, top: 360, width: 520 }}>
          <Rise at={sealAt + 10}>
            <Mono size={22} color={C.moon2}>
              every 30 minutes, all 91 stocks
            </Mono>
          </Rise>
          <Rise at={sealAt + 30} style={{ marginTop: 10 }}>
            <Counter to={data.chain.seals} at={sealAt + 30} dur={50} size={96} color={C.sodium} />
            <div style={{ fontFamily: F.sans, fontSize: 24, color: C.moon1 }}>roots sealed for Monday's open</div>
          </Rise>
        </div>
      )}
      {f >= lockAt && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: "86px 140px" }}>
          <Rise at={lockAt}>
            <div style={{ fontFamily: F.sans, fontSize: 30, color: C.sodium }}>On BNB Chain, before the bell</div>
            <div style={{ fontFamily: F.display, fontSize: 72, color: C.moon0, marginTop: 8 }}>Sealed. Nobody can change it. Not even us.</div>
          </Rise>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

// ── S5 · Don't trust us ─────────────────────────────────────────────────────────────────────────
export function S5({ dur }: { dur: number }) {
  const a = cue("s5", "Change the forecast by a single cent", dur, 0.6) - 10;
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Night seed={11} />
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Screen src="capture/verify.mp4" from={60} small url="nightshift-oracle.vercel.app/verify" focus={[[0, 1.0, 50, 30], [Math.round(a * 0.45), 1.22, 62, 38], [a, 1.3, 62, 55]]} />
        <div style={{ position: "absolute", left: 180, top: 34 }}>
          <Rise at={cue("s5", "No wallet", dur, 0.4)}>
            <Tag color={C.up} size={26}>
              No wallet. No sign-up. Your browser asks the contract.
            </Tag>
          </Rise>
        </div>
      </Shot>
      <Shot from={a} to={dur} fadeOut={0}>
        <Screen src="capture/tamper.mp4" from={405} small url="nightshift-oracle.vercel.app/verify" focus={[[0, 1.0, 50, 50], [Math.round((dur - a) * 0.45), 1.18, 66, 52], [dur - a, 1.25, 66, 62]]} />
        <div style={{ position: "absolute", left: 180, top: 34 }}>
          <Rise at={8}>
            <Tag color={C.down} size={26}>
              Changed by one cent: rejected on-chain
            </Tag>
          </Rise>
        </div>
      </Shot>
    </AbsoluteFill>
  );
}

// ── S6 · The bell ───────────────────────────────────────────────────────────────────────────────
function BellRings({ start }: { start: number }) {
  const f = useCurrentFrame();
  return (
    <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
      {[0, 1, 2, 3].map((i) => {
        const t = (f - start - i * 9) / 45;
        if (t < 0 || t > 1) return null;
        return <circle key={i} cx={960} cy={500} r={80 + t * 520} fill="none" stroke={C.sodium} strokeWidth={4 * (1 - t)} opacity={1 - t} />;
      })}
    </svg>
  );
}

export function S6({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const a = cue("s6", "At Friday's open", dur, 0.2) - 6;
  const b = cue("s6", "Across 174", dur, 0.6) - 6;
  const c = cue("s6", "And through ERC-8183", dur, 0.8) - 6;
  const thursday = cue("s6", "Thursday's close", dur, 0.4);
  const bell = data.bell;
  const rows = ["nfv", "echo", "anchor"].map((k) => bell.lastCommits.find((x) => x.f === k)!);
  const maxErr = Math.max(...rows.map((r) => Math.abs(r.errBps)));
  const day = new Date(bell.anchorTime).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
  const prevDay = new Date(bell.anchorTime - 86_400_000).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
  const label: Record<string, string> = { nfv: "NFV, our model", echo: "Echo, the token's price", anchor: `Anchor, ${prevDay}'s close` };
  const color: Record<string, string> = { nfv: C.nfv, echo: C.echo, anchor: C.anchor };
  const o = data.opens;
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Broll src="broll/hd/clock.mp4" from={30} zoom={[1.0, 1.15]} scrim={0.3} />
        <BellRings start={18} />
        <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 45%, rgba(10,15,30,0.92) 78%)" }} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 150 }}>
          <Rise at={12}>
            <Mono size={120} color={C.sodium} style={{ fontWeight: 300 }}>
              09:30 ET
            </Mono>
          </Rise>
          <Rise at={44}>
            <div style={{ fontFamily: F.display, fontSize: 60, color: C.moon0, marginTop: 10 }}>The bell. Reality keeps score.</div>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={b + 8}>
        <Night seed={13} />
        <AbsoluteFill style={{ padding: "90px 150px" }}>
          <Kicker at={2}>{day}'s open, scored</Kicker>
          <Rise at={6} style={{ marginTop: 12 }}>
            <span style={{ fontFamily: F.display, fontSize: 70, color: C.moon0 }}>
              NVDAB opened at <span style={{ fontFamily: F.mono, fontWeight: 300 }}>{usd(bell.realized)}</span>
            </span>
          </Rise>
          <div style={{ marginTop: 50, display: "grid", gap: 30 }}>
            {rows.map((r, i) => {
              // NFV and Echo land with "At Friday's open…", the anchor with "Thursday's close missed by 146".
              const startRow = i < 2 ? 24 + i * 12 : thursday - a;
              const w = interpolate(f - a, [startRow, startRow + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={r.f} style={{ display: "flex", alignItems: "center", gap: 26 }}>
                  <div style={{ width: 120, height: 120, overflow: "visible" }}>
                    <Owl kind={r.f as OwlKind} size={110} phase={i * 17} mood={Math.abs(r.errBps) < 20 ? "happy" : "worried"} />
                  </div>
                  <div style={{ width: 430, fontFamily: F.sans, fontSize: 30, color: C.moon1 }}>{label[r.f]}</div>
                  <div style={{ flex: 1, position: "relative", height: 44 }}>
                    <div style={{ height: 44, width: `${Math.max(1.2, (Math.abs(r.errBps) / maxErr) * 100) * w}%`, background: color[r.f], borderRadius: 8, opacity: 0.9 }} />
                  </div>
                  <Mono size={36} color={C.moon0} style={{ width: 300, textAlign: "right" }}>
                    {r.errBps >= 0 ? "+" : "−"}
                    {Math.abs(r.errBps).toFixed(1)} bps
                  </Mono>
                  <span style={{ fontFamily: F.sans, fontSize: 24, color: r.covered ? C.up : C.down, width: 170 }}>{r.covered ? "inside band" : "outside band"}</span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </Shot>
      <Shot from={b} to={c + 8}>
        <Night seed={14} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 140 }}>
          <Dots total={o.total} below={o.below} above={o.total - o.inside - o.below} />
          <Rise at={30} style={{ marginTop: 40, textAlign: "center" }}>
            <div style={{ fontFamily: F.display, fontSize: 62, color: C.moon0 }}>
              <span style={{ color: C.up }}>{o.inside}</span> of {o.total} stock openings landed inside the 90% band.
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 32, color: C.moon2, marginTop: 10 }}>
              Only <span style={{ color: C.down }}>{o.below}</span> landed below it, the side a lender values collateral at.
            </div>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={c} to={dur} fadeOut={0}>
        <Night seed={15} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Card style={{ width: 1300, display: "flex", gap: 40, alignItems: "center" }}>
            <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke={C.sodium} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
              <path d="M3 10l2-5h14l2 5" />
              <path d="M10 14h4" />
            </svg>
            <div>
              <Kicker at={4}>ERC-8183 on BNB's commerce contracts</Kicker>
              <Rise at={10}>
                <div style={{ fontFamily: F.display, fontSize: 56, color: C.moon0, marginTop: 8 }}>A forecaster is paid only when the open proves it right.</div>
              </Rise>
              <Rise at={24}>
                <div style={{ fontFamily: F.sans, fontSize: 28, color: C.moon2, marginTop: 10 }}>{data.chain.jobs > 0 ? `${data.chain.jobs} jobs funded on-chain for the next open` : "Escrowed in U; it beats the no-skill baseline, or it isn't paid"}</div>
              </Rise>
            </div>
          </Card>
        </AbsoluteFill>
      </Shot>
    </AbsoluteFill>
  );
}

function Dots({ total, below, above }: { total: number; below: number; above: number }) {
  const f = useCurrentFrame();
  const cols = 29;
  return (
    <svg width={cols * 40} height={Math.ceil(total / cols) * 40}>
      {Array.from({ length: total }).map((_, i) => {
        const v = interpolate(f, [i * 0.25, i * 0.25 + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const fill = i >= total - below ? C.down : i >= total - below - above ? C.sodium : C.up;
        return <circle key={i} cx={(i % cols) * 40 + 20} cy={Math.floor(i / cols) * 40 + 20} r={13 * v} fill={fill} opacity={0.9} />;
      })}
    </svg>
  );
}
