import * as Dialog from "@radix-ui/react-dialog";
import { Menu, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router";
import { nextRegularOpen, sessionAt } from "@ns/calendar";
import { Wordmark } from "@/components/brand/Mark";
import { Countdown } from "@/components/ui/Countdown";
import { useNow } from "@/hooks/useNow";
import { SESSION_LABEL, et } from "@/lib/format";
import { ringBell, setSound, useSound } from "@/lib/sound";

export const NAV = [
  { to: "/radar", label: "Radar" },
  { to: "/proof", label: "On-chain proof" },
  { to: "/scoreboard", label: "Scoreboard" },
  { to: "/verify", label: "Verify" },
  { to: "/stack", label: "Stack" },
] as const;

/** The session clock: what the real market is doing right now, and when the bell rings. */
export function SessionClock({ compact = false }: { compact?: boolean }) {
  const now = useNow();
  const session = sessionAt(now);
  const open = session === "regular";
  const bell = nextRegularOpen(now);
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="inline-flex items-center gap-2 text-moon-2">
        <span className={open ? "size-1.5 rounded-full bg-up" : "ns-live"} aria-hidden />
        {SESSION_LABEL[session]}
      </span>
      {!compact && <span className="hidden text-moon-3 lg:inline">{et(now)}</span>}
      {!open && (
        <span className="inline-flex items-center gap-1.5 text-moon-2">
          <span className="hidden sm:inline">Bell in</span>
          <Countdown to={bell} className="text-sodium" />
        </span>
      )}
    </div>
  );
}

function SoundToggle() {
  const on = useSound();
  return (
    <button
      type="button"
      onClick={() => {
        setSound(!on);
        if (!on) setTimeout(() => ringBell(0.12), 60);
      }}
      aria-pressed={on}
      aria-label={on ? "Mute the opening bell" : "Play the opening bell sound"}
      className="pressable grid size-9 place-items-center rounded-md text-moon-2 hover:bg-night-2 hover:text-moon-0"
    >
      {on ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
    </button>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled ? "glass bg-night-0/72 shadow-[0_1px_0_var(--color-rule)] backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Nightshift home" className="shrink-0 rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              viewTransition
              className={({ isActive }) => `rounded-md px-3 py-1.5 text-[14px] transition-colors ${isActive ? "text-moon-0" : "text-moon-2 hover:text-moon-0"}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <SessionClock />
          </div>
          <SoundToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Open menu" className="pressable grid size-9 place-items-center rounded-md text-moon-1 hover:bg-night-2 md:hidden">
          <Menu size={18} strokeWidth={1.5} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-night-0/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 top-3 z-[61] rounded-[14px] bg-night-2 p-5 shadow-[var(--elev-3)]">
          <div className="flex items-center justify-between">
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Wordmark />
            <Dialog.Close asChild>
              <button type="button" aria-label="Close menu" className="pressable grid size-9 place-items-center rounded-md text-moon-1">
                <X size={18} strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4">
            <SessionClock compact />
          </div>
          <nav aria-label="Mobile" className="mt-5 grid">
            {[{ to: "/", label: "Home" }, ...NAV].map((n) => (
              <Dialog.Close asChild key={n.to}>
                <NavLink to={n.to} className="border-t border-rule py-3.5 font-display text-[1.6rem] text-moon-0">
                  {n.label}
                </NavLink>
              </Dialog.Close>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
