/** Dependency-free SVG line chart for study figures (light/dark friendly via currentColor text). */
export interface LineSeries {
  name: string;
  values: number[];
  color: string;
}

export function lineChart(opts: { title: string; xLabels: string[]; series: LineSeries[]; yLabel: string; width?: number; height?: number }): string {
  const W = opts.width ?? 760;
  const H = opts.height ?? 380;
  const m = { l: 64, r: 24, t: 48, b: 64 };
  const all = opts.series.flatMap((s) => s.values).filter(Number.isFinite);
  const yMax = Math.max(...all) * 1.1;
  const yMin = 0;
  const x = (i: number) => m.l + (i * (W - m.l - m.r)) / Math.max(1, opts.xLabels.length - 1);
  const y = (v: number) => H - m.b - ((v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const ticks = 5;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    return `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="0.12"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.7">${v.toFixed(0)}</text>`;
  }).join("");
  const xl = opts.xLabels.map((l, i) => `<text x="${x(i)}" y="${H - m.b + 18}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.8">${esc(l)}</text>`).join("");
  const lines = opts.series
    .map((s) => {
      const pts = s.values.map((v, i) => (Number.isFinite(v) ? `${x(i)},${y(v)}` : null)).filter(Boolean);
      const dots = s.values.map((v, i) => (Number.isFinite(v) ? `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"/>` : "")).join("");
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    })
    .join("");
  const legend = opts.series
    .map((s, i) => `<g transform="translate(${m.l + i * 230},${H - 20})"><rect width="14" height="4" y="-6" fill="${s.color}"/><text x="20" y="0" font-size="12" fill="currentColor">${esc(s.name)}</text></g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif" style="color:#1f2328">
<text x="${m.l}" y="26" font-size="15" font-weight="600" fill="currentColor">${esc(opts.title)}</text>
<text transform="translate(16,${(H - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.7">${esc(opts.yLabel)}</text>
${grid}${xl}${lines}${legend}
</svg>
`;
}
