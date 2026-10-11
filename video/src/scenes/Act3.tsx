import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import data from "../data.json";
import { Owl } from "../components/Owl";
import { Broll, Card, Counter, Kicker, Kinetic, Mono, Night, Rise, Screen, short, Tag, usd, useIn } from "../components/ui";
import { cue } from "../cues";
import { C, F } from "../theme";
import { Shot } from "./Act1";

const at = (dur: number, x: number) => Math.round(dur * x);
type Step = { tx?: string; at: string; usdt?: string; nvdab?: string };

// ── S7 · Contracts read it ──────────────────────────────────────────────────────────────────────
export function S7({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const a = cue("s7", "The same price ships", dur, 0.56) - 6;
  const valued = cue("s7", "mainnet, with the collateral", dur, 0.35);
  const loan = data.chain.loan as unknown as { steps: Record<string, Step>; summary: { valuedAt: string; fairValue: string; debtUsdt: string; healthFactor: string } };
  const steps: [string, string][] = [
    ["buy", "Bought NVDAB through the Binance Trading API"],
    ["lend", "The treasury lent USDT into the credit vault"],
    ["collateral", "Posted the NVDAB as collateral"],
    ["borrow", `Borrowed ${Number(loan.summary.debtUsdt).toFixed(4)} USDT against it`],
  ];
  const nodes: [string, string, number][] = [
    ["Credit vault", "lends at the band's low edge", 0],
    ["6 Chainlink-compatible feeds", "AggregatorV3 latestRoundData()", 1],
    ["Venus adapter", "the same OracleInterface Venus reads", 2],
  ];
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Broll src="broll/hd/city-night-2.mp4" zoom={[1.0, 1.08]} scrim={0.62} />
        <AbsoluteFill style={{ padding: "100px 150px" }}>
          <Kicker at={2}>Contracts read it</Kicker>
          <Rise at={6} style={{ marginTop: 10 }}>
            <span style={{ fontFamily: F.display, fontSize: 84, color: C.moon0 }}>
              A loan against NVIDIA, <span style={{ color: C.sodium }}>10 p.m. on a Saturday.</span>
            </span>
          </Rise>
          <div style={{ marginTop: 48, display: "grid", gap: 18, maxWidth: 1300 }}>
            {steps.map(([k, label], i) => (
              <Rise key={k} at={20 + i * 12}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "16px 24px", borderRadius: 14, background: "rgba(15,22,40,0.82)", border: `1px solid ${C.rule}` }}>
                  <span style={{ fontFamily: F.sans, fontSize: 30, color: C.moon1 }}>
                    <span style={{ color: C.up, marginRight: 14 }}>✓</span>
                    {label}
                  </span>
                  <Mono size={24} color={C.moon2}>
                    tx {short(loan.steps[k]?.tx ?? "0x", 8, 6)}
                  </Mono>
                </div>
              </Rise>
            ))}
          </div>
          <Rise at={valued} style={{ marginTop: 30 }}>
            <span style={{ fontFamily: F.sans, fontSize: 32, color: C.moon2 }}>
              Collateral valued at <span style={{ fontFamily: F.mono, color: C.sodium }}>{usd(Number(loan.summary.valuedAt))}</span>, the band's low edge, not the{" "}
              <span style={{ fontFamily: F.mono, color: C.moon1 }}>{usd(Number(loan.summary.fairValue))}</span> fair value. Health factor{" "}
              <span style={{ fontFamily: F.mono, color: C.moon0 }}>{Number(loan.summary.healthFactor).toFixed(2)}</span>.
            </span>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={dur} fadeOut={0}>
        <Night seed={21} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
            {nodes.map(([, , i]) => {
              const v = interpolate(f - a, [16 + i * 8, 40 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const y = 292 + i * 240;
              const d = `M 760 540 L ${760 + 450 * v} ${540 + (y - 540) * v}`;
              const pulse = ((f - a) % 40) / 40;
              return (
                <g key={i}>
                  <path d={d} stroke="rgba(255,178,63,0.45)" strokeWidth="3" fill="none" />
                  {v === 1 && <circle cx={760 + 450 * pulse} cy={540 + (y - 540) * pulse} r="7" fill={C.sodium} />}
                </g>
              );
            })}
          </svg>
          <div style={{ position: "absolute", left: 300, top: 430 }}>
            <Rise at={4}>
              <Card style={{ width: 460, textAlign: "center", borderColor: "rgba(255,178,63,0.5)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 36, color: C.moon0 }}>NightshiftOracle</div>
                <Mono size={20} color={C.moon2}>
                  {data.chain.oracleReports} reports posted on BNB Chain
                </Mono>
              </Card>
            </Rise>
          </div>
          {nodes.map(([title, sub, i]) => (
            <div key={title} style={{ position: "absolute", left: 1210, top: 240 + i * 240, width: 560 }}>
              <Rise at={30 + i * 8}>
                <Card style={{ padding: 26 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 32, color: C.moon0 }}>{title}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 22, color: C.moon2, marginTop: 4 }}>{sub}</div>
                </Card>
              </Rise>
            </div>
          ))}
        </AbsoluteFill>
      </Shot>
    </AbsoluteFill>
  );
}

// ── S8 · Built on Binance Web3 ──────────────────────────────────────────────────────────────────
const MODULE_NAME: Record<string, string> = { rwa: "RWA Data", trading: "Trading", transaction: "Transaction", b402: "b402 payments" };
export function S8({ dur }: { dur: number }) {
  const a = cue("s8", "Every call", dur, 0.45) + 24;
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Shot from={0} to={a + 8} fadeIn={0}>
        <Broll src="broll/hd/milky-way.mp4" zoom={[1.0, 1.06]} scrim={0.55} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <Kicker at={2}>Built on Binance Web3</Kicker>
          <div style={{ marginTop: 16 }}>
            <Counter to={data.stack.calls24h} at={8} dur={45} size={210} />
          </div>
          <Rise at={20}>
            <div style={{ fontFamily: F.display, fontSize: 56, color: C.moon0 }}>Binance Web3 API calls in the last 24 hours</div>
          </Rise>
          <div style={{ display: "flex", gap: 18, marginTop: 44, flexWrap: "wrap", justifyContent: "center", maxWidth: 1500 }}>
            {data.stack.modules.map((m, i) => (
              <Rise key={m.module} at={30 + i * 6}>
                <Tag color={C.sodium} size={28}>
                  {MODULE_NAME[m.module] ?? m.module} <Mono size={24} color={C.moon2}>{m.calls24h.toLocaleString("en-US")}</Mono>
                </Tag>
              </Rise>
            ))}
          </div>
          <Rise at={52} style={{ marginTop: 34 }}>
            <span style={{ fontFamily: F.sans, fontSize: 28, color: C.moon2 }}>Quotes, swaps, MEV-protected broadcasts, b402 payments: every call and every outcome code, logged by our own SDK.</span>
          </Rise>
        </AbsoluteFill>
      </Shot>
      <Shot from={a} to={dur} fadeOut={0}>
        <Screen src="capture/stack.mp4" from={45} url="nightshift-oracle.vercel.app/stack" focus={[[0, 1.0, 50, 20], [dur - a, 1.1, 50, 45]]} />
      </Shot>
    </AbsoluteFill>
  );
}

// ── S9 · Any agent can use it ───────────────────────────────────────────────────────────────────
export function S9({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const r = data.chain.trade?.receipt as
    | { amountUsd: number; amountToken: number; token: { symbol: string }; pricePerToken: number; reference: { fairValue: number; lower: number; upper: number }; tca: { vsFairValueBps: number; verdict: string }; receiptHash: string; txHash: string }
    | undefined;
  const tx = data.chain.trade?.tx ?? "";
  const lines: [string, string][] = [
    ["you", "Buy $5 of NVIDIA with my Agentic Wallet, only inside Nightshift's band."],
    ["skill", "which NVDA → NVDAB, the cheapest real share"],
    ["skill", `fair value ${usd(r?.reference.fairValue ?? 0)}, band ${usd(r?.reference.lower ?? 0)} – ${usd(r?.reference.upper ?? 0)}`],
    ["baw", `market-order swap 5 USDT → NVDAB … filled, tx ${short(tx, 8, 6)}`],
    ["receipt", r?.tca.verdict ?? ""],
    ["x402", "GET /x402/fair-value/NVDAB → 402 Payment Required ($0.01)"],
    ["baw", "x402-payment preview → USDT 0.01, READY_TO_SIGN"],
  ];
  const per = Math.max(18, Math.floor((dur * 0.7) / lines.length));
  const lineAt = [
    14,
    cue("s9", "the cheapest real share", dur, 0.3) - 10,
    cue("s9", "the cheapest real share", dur, 0.3) + 18,
    cue("s9", "the cheapest real share", dur, 0.3) + 60,
    cue("s9", "the cheapest real share", dur, 0.3) + 92,
    cue("s9", "It can even pay", dur, 0.7),
    cue("s9", "It can even pay", dur, 0.7) + 40,
  ];
  const printAt = cue("s9", "the cheapest real share", dur, 0.3) + 92;
  const paper = interpolate(f, [printAt, printAt + 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Night seed={31} />
      <AbsoluteFill style={{ padding: "90px 120px" }}>
        <Kicker at={2}>Any agent can use it</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 60, marginTop: 30 }}>
          <div style={{ background: "#0B1020", borderRadius: 18, border: `1px solid ${C.rule}`, boxShadow: "0 30px 90px -30px rgba(0,0,0,0.8)", overflow: "hidden" }}>
            <div style={{ height: 44, background: "#111a30", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
              {["#FF7A66", "#FFB23F", "#59D98E"].map((c) => (
                <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.8 }} />
              ))}
              <span style={{ marginLeft: 16, fontFamily: F.sans, fontSize: 18, color: C.moon2 }}>Claude Code, Binance Agentic Wallet + Nightshift skill</span>
            </div>
            <div style={{ padding: "26px 30px", display: "grid", gap: 18 }}>
              {lines.map(([who, text], i) => {
                const start = lineAt[i] ?? 14 + i * per;
                const n = Math.round(interpolate(f, [start, start + Math.min(per - 4, text.length * 0.6)], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
                if (f < start) return null;
                const tint = who === "you" ? C.moon0 : who === "receipt" ? C.up : who === "x402" ? C.sodium : C.moon1;
                return (
                  <div key={i} style={{ fontFamily: F.mono, fontSize: 23, lineHeight: 1.45, color: tint }}>
                    <span style={{ color: C.moon3 }}>{who === "you" ? "›" : `${who}`} </span>
                    {text.slice(0, n)}
                  </div>
                );
              })}
            </div>
          </div>
          {r && (
            <div style={{ position: "relative", height: 760, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, borderRadius: 8, background: C.night3 }} />
              <div style={{ position: "absolute", top: 8, left: 22, right: 22, height: 520 * paper, overflow: "hidden" }}>
                <div style={{ background: "#F4F1E8", color: C.night0, padding: "34px 34px", fontFamily: F.mono, fontSize: 21, lineHeight: 1.65, position: "absolute", top: 0, left: 0, right: 0 }}>
                  <div style={{ fontFamily: F.display, fontSize: 36, textAlign: "center", marginBottom: 12 }}>Nightshift receipt</div>
                  {[
                    ["Paid", `${r.amountUsd.toFixed(2)} USDT`],
                    ["Received", `${r.amountToken.toFixed(6)} ${r.token.symbol}`],
                    ["Price per token", usd(r.pricePerToken)],
                    ["Fair value then", usd(r.reference.fairValue)],
                    ["90% band", `${usd(r.reference.lower)} – ${usd(r.reference.upper)}`],
                    ["Price vs fair", `+${(r.tca.verdict.match(/([\d.]+) bps/)?.[1] ?? r.tca.vsFairValueBps.toFixed(1))} bps`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed rgba(10,15,30,0.25)" }}>
                      <span>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 16, fontSize: 18, textAlign: "center" }}>Inside the band. Rebuilt from on-chain logs.</div>
                  <div style={{ marginTop: 8, fontSize: 16, textAlign: "center", opacity: 0.6 }}>receipt {short(r.receiptHash, 10, 6)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── S10 · Outro ─────────────────────────────────────────────────────────────────────────────────
export function S10({ dur }: { dur: number }) {
  const v = useIn(6, 30);
  return (
    <AbsoluteFill style={{ background: C.night0 }}>
      <Broll src="broll/hd/stars.mp4" zoom={[1.0, 1.05]} scrim={0.5} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", opacity: v, transform: `translateY(${(1 - v) * 30}px)` }}>
          <Owl kind="anchor" size={150} phase={3} mood="happy" />
          <Owl kind="echo" size={170} phase={19} mood="happy" />
          <Owl kind="nfv" size={150} phase={37} mood="happy" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34, opacity: v }}>
          <svg width="76" height="76" viewBox="0 0 32 32">
            <defs>
              <mask id="m">
                <rect width="32" height="32" fill="#fff" />
                <circle cx="21" cy="12.5" r="11" fill="#000" />
              </mask>
            </defs>
            <circle cx="15" cy="16" r="12" fill={C.moon0} mask="url(#m)" />
            <circle cx="25.6" cy="21.2" r="2.4" fill={C.sodium} />
          </svg>
          <span style={{ fontFamily: F.wordmark, fontSize: 92, color: C.moon0 }}>Nightshift</span>
        </div>
        <Kinetic text="Wall Street sleeps. Nightshift doesn't." at={20} size={72} style={{ marginTop: 18 }} />
        <Rise at={50} style={{ marginTop: 26 }}>
          <Mono size={34} color={C.sodium}>
            nightshift-oracle.vercel.app
          </Mono>
        </Rise>
        <Rise at={60} style={{ marginTop: 12 }}>
          <Mono size={24} color={C.moon2}>
            github.com/iamdflame/nightshift
          </Mono>
        </Rise>
        <Rise at={Math.max(70, dur - 90)} style={{ marginTop: 40 }}>
          <span style={{ fontFamily: F.sans, fontSize: 18, color: C.moon3 }}>Footage: NASA (public domain), Mixkit. Music: "Moon Walk", Eugenio Mininni (Mixkit). All figures live from BNB Chain mainnet.</span>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
