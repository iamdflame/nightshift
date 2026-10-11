import { Link } from "react-router";
import { Mark } from "@/components/brand/Mark";

export default function NotFound() {
  return (
    <section className="grain relative mx-auto grid min-h-[80svh] max-w-[1320px] place-items-center px-4 pt-24 text-center sm:px-6">
      <title>Still in the dark hours · Nightshift</title>
      <div>
        <div className="mx-auto w-fit opacity-80">
          <Mark size={88} />
        </div>
        <h1 className="mt-8 text-[clamp(2.4rem,5vw,4.2rem)] font-light">This page is still in the dark hours.</h1>
        <p className="mx-auto mt-4 max-w-[48ch] text-moon-2">Nothing was committed at this address, so there is nothing for reality to score. Try the radar, or verify a forecast that was.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/radar" className="pressable rounded-md bg-sodium px-5 py-2.5 font-medium text-night-0">
            Open the radar
          </Link>
          <Link to="/verify" className="pressable rounded-md px-5 py-2.5 text-moon-1 hairline hover:bg-night-2">
            Verify a forecast
          </Link>
        </div>
      </div>
    </section>
  );
}
