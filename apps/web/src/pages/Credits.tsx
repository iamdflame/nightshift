const CREDITS: [string, string, string][] = [
  ["Moon color and elevation maps", "NASA's Scientific Visualization Studio, CGI Moon Kit (public domain). NASA does not endorse this project.", "https://svs.gsfc.nasa.gov/4720"],
  ["Earth at night", "NASA Earth Observatory, Black Marble 2016 (public domain).", "https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps"],
  ["Earth by day", "NASA Earth Observatory, Blue Marble Next Generation, Reto Stöckli (public domain).", "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/"],
  ["Star catalog and constellation lines", "d3-celestial by Olaf Frohn (BSD-3-Clause), from the XHIP catalog.", "https://github.com/ofrohn/d3-celestial"],
  ["New York Stock Exchange at night", "Photo by Keenan Constance on Pexels.", "https://www.pexels.com/photo/5691263/"],
  ["Observatory under the stars", "Photo by Ahmed Atef on Unsplash.", "https://unsplash.com/photos/b7lnMZqv1YE"],
  ["Street under sodium lamps", "Photo by Daniel on Unsplash.", "https://unsplash.com/photos/o0RSj94M3IA"],
  ["Manhattan at night", "Photo by Donny Jiang on Unsplash.", "https://unsplash.com/photos/2UsiOVp3SSk"],
  ["Milky Way", "Photo by Oleg Moroz on Unsplash.", "https://unsplash.com/photos/NvMRsH2pFaE"],
  ["Type", "Newsreader (Production Type), Instrument Sans and Instrument Serif (Rodrigo Fuenzalida, Jordan Egstad), Martian Mono (Evil Martians). SIL Open Font License.", "https://fonts.google.com"],
  ["Sun and Moon positions", "astronomy-engine by Don Cross (MIT).", "https://github.com/cosinekitty/astronomy"],
];

export default function Credits() {
  return (
    <section className="mx-auto max-w-[900px] px-4 pb-24 pt-32 sm:px-6">
      <title>Credits · Nightshift</title>
      <h1 className="text-[clamp(2.4rem,4vw,3.6rem)] font-light">Imagery and data credits</h1>
      <p className="mt-4 text-moon-2">Every photograph, texture and dataset on this site is licensed for this use. Thank you to the people and institutions who made them.</p>
      <ul className="mt-10 divide-y divide-[var(--color-rule)] border-y border-rule">
        {CREDITS.map(([what, who, href]) => (
          <li key={what} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
            <span className="text-moon-0">{what}</span>
            <a href={href} target="_blank" rel="noreferrer" className="text-moon-2 underline-offset-4 hover:text-moon-0 hover:underline">
              {who}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
