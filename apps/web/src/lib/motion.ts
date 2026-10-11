/** One motion language for motion/react and GSAP (values from the UI brief, §2d). */
export const ease = {
  out: [0.23, 1, 0.32, 1] as const,
  std: [0.2, 0, 0, 1] as const,
  travel: [0.77, 0, 0.175, 1] as const,
  drawer: [0.32, 0.72, 0, 1] as const,
};
export const gsapEase = { out: "expo.out", travel: "power3.inOut", std: "power2.out" };

export const spring = {
  ui: { type: "spring", bounce: 0, duration: 0.35 },
  digit: { type: "spring", bounce: 0, duration: 0.45 },
  settle: { type: "spring", bounce: 0.15, duration: 0.5 },
  icon: { type: "spring", bounce: 0, duration: 0.3 },
} as const;

export const dur = { press: 0.12, fast: 0.16, base: 0.22, slow: 0.36, exit: 0.14 };

/** Enter: opacity + 4px blur + 12px rise (better-ui), staggered in chunks. */
export const enter = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  shown: (i = 0) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: ease.out, delay: i * 0.08 } }),
};
