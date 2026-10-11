/** Tonight's real moon (astronomy-engine), without three.js, so the hero's caption doesn't wait for the sky. */
import * as Astronomy from "astronomy-engine";
import { useMemo } from "react";

export function moonState(date = new Date()) {
  const ill = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const phase = Astronomy.MoonPhase(date); // 0 new → 90 first quarter → 180 full → 270 last quarter
  const waxing = phase < 180;
  const fraction = ill.phase_fraction;
  const name =
    fraction < 0.03 ? "New moon" : fraction > 0.97 ? "Full moon" : phase < 90 ? "Waxing crescent" : phase < 180 ? (fraction > 0.5 ? "Waxing gibbous" : "First quarter") : phase < 270 ? (fraction > 0.5 ? "Waning gibbous" : "Last quarter") : "Waning crescent";
  return { phaseAngle: ill.phase_angle, fraction, waxing, name };
}

export function MoonPhaseLabel() {
  const s = useMemo(() => moonState(), []);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/New_York" }).format(new Date());
  if (s.fraction < 0.03) return <span>tonight is a new moon, the darkest night of the month</span>;
  return (
    <span>
      {s.name.toLowerCase()}, {Math.round(s.fraction * 100)}% lit ({day})
    </span>
  );
}
