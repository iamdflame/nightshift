/** A licensed, duotoned photograph (see /credits), served as AVIF/WebP at 960/1600/2400. */
export function Photo({ name, alt, className = "", sizes = "100vw", priority = false }: { name: "nyse-night" | "observatory" | "sodium-street" | "manhattan" | "milkyway"; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  const set = (ext: string) => [960, 1600, 2400].map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(", ");
  return (
    <picture>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
      <img src={`/img/${name}-1600.webp`} alt={alt} className={className} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
    </picture>
  );
}
