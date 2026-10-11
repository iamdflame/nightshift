/**
 * The night sky over Wall Street, now.
 *   - Stars: 2,851 real stars (≤ 5.5 mag, d3-celestial/XHIP) placed by their true altitude/azimuth above
 *     11 Wall St at the current local sidereal time; colour from B−V; size from magnitude; scintillation.
 *   - Moon: NASA LRO colour + relief, lit at tonight's real phase (astronomy-engine).
 *   - Meteors: one amber streak per real ForecastBook commit (events prop), seeded by its tx hash.
 * Lazy-loaded; aria-hidden; one static frame under reduced motion; paused when off-screen.
 */
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as Astronomy from "astronomy-engine";
import { useReducedMotion } from "motion/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export interface SkyEvent {
  tx: string;
  forecaster: "anchor" | "echo" | "nfv";
  t: number;
}

const LAT = 40.7069;
const LON = -74.0113;
const DEG = Math.PI / 180;
/** Where the camera looks: south-south-east, 28° up (the sky over the harbour from Wall St). */
const VIEW_AZ = 158;
const VIEW_ALT = 30;

/** Unit vector for altitude/azimuth in a local frame: x = east, y = up, z = north (camera looks along −z-ish). */
function altAzToVec(alt: number, az: number, r = 1): THREE.Vector3 {
  const ca = Math.cos(alt * DEG);
  return new THREE.Vector3(ca * Math.sin(az * DEG) * r, Math.sin(alt * DEG) * r, ca * Math.cos(az * DEG) * r);
}

function equToAltAz(raDeg: number, decDeg: number, lstDeg: number): [number, number] {
  const ha = (lstDeg - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = LAT * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;
  return [alt / DEG, az / DEG];
}

function lstDeg(date: Date): number {
  return (((Astronomy.SiderealTime(date) * 15 + LON) % 360) + 360) % 360;
}

/** B−V colour index → star colour. */
function bvColor(bv: number): THREE.Color {
  const stops: [number, string][] = [
    [-0.3, "#9db4ff"],
    [0, "#c9d7ff"],
    [0.4, "#f4f1e8"],
    [0.8, "#ffe7c4"],
    [1.2, "#ffd09a"],
    [1.8, "#ffb47a"],
  ];
  const v = Math.min(1.8, Math.max(-0.3, bv));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i]!;
    const [b, cb] = stops[i + 1]!;
    if (v <= b) return new THREE.Color(ca).lerp(new THREE.Color(cb), (v - a) / (b - a));
  }
  return new THREE.Color(stops[stops.length - 1]![1]);
}

type StarData = { fields: string[]; data: number[] };
type ConstData = { id: string; lines: [number, number][][] }[];

function useSkyData() {
  const [d, setD] = useState<{ stars: StarData; lines: ConstData } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([fetch("/data/stars.json").then((r) => r.json()), fetch("/data/constellations.json").then((r) => r.json())])
      .then(([stars, lines]) => live && setD({ stars, lines }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return d;
}

const starVert = /* glsl */ `
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; uniform float uPixel; uniform float uTwinkle;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 1.0 + uTwinkle * 0.28 * sin(uTime * (1.3 + fract(aPhase * 7.1) * 2.2) + aPhase * 6.2831);
    gl_PointSize = aSize * uPixel * tw;
    vColor = aColor; vAlpha = clamp(0.35 + aSize * 0.18, 0.0, 1.0) * (0.85 + 0.15 * tw);
    gl_Position = projectionMatrix * mv;
  }`;
const starFrag = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float glow = exp(-d * 9.0);
    float a = (core * 0.55 + glow * 0.75) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * (0.85 + glow * 0.4), a);
  }`;

function Stars({ data, quality, reduce }: { data: { stars: StarData; lines: ConstData }; quality: "high" | "low"; reduce: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const { geom, lineGeom } = useMemo(() => {
    const lst = lstDeg(new Date());
    const pos: number[] = [], size: number[] = [], phase: number[] = [], col: number[] = [];
    const s = data.stars.data;
    const maxMag = quality === "low" ? 4.6 : 5.5;
    for (let i = 0; i < s.length; i += 4) {
      const ra = s[i]!, dec = s[i + 1]!, mag = s[i + 2]!, bv = s[i + 3]!;
      if (mag > maxMag) continue;
      const [alt, az] = equToAltAz(ra, dec, lst);
      if (alt < -2) continue;
      const v = altAzToVec(alt, az, 400);
      pos.push(v.x, v.y, v.z);
      size.push(Math.max(1.1, Math.pow(6.4 - mag, 1.55) * 0.95));
      phase.push((ra * 13.37 + dec * 7.11) % 1);
      const c = bvColor(bv);
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
    const lp: number[] = [];
    for (const c of data.lines)
      for (const line of c.lines)
        for (let i = 0; i < line.length - 1; i++) {
          const [a1, z1] = equToAltAz(line[i]![0], line[i]![1], lst);
          const [a2, z2] = equToAltAz(line[i + 1]![0], line[i + 1]![1], lst);
          if (a1 < 2 || a2 < 2) continue;
          const p = altAzToVec(a1, z1, 399), q = altAzToVec(a2, z2, 399);
          lp.push(p.x, p.y, p.z, q.x, q.y, q.z);
        }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    return { geom: g, lineGeom: lg };
  }, [data, quality]);
  useEffect(() => () => (geom.dispose(), lineGeom.dispose()), [geom, lineGeom]);
  useFrame((st) => {
    if (mat.current) mat.current.uniforms.uTime!.value = st.clock.elapsedTime;
  });
  return (
    <group>
      <points geometry={geom}>
        <shaderMaterial
          ref={mat}
          vertexShader={starVert}
          fragmentShader={starFrag}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{ uTime: { value: 0 }, uPixel: { value: Math.min(gl.getPixelRatio(), 1.5) }, uTwinkle: { value: reduce ? 0 : 1 } }}
        />
      </points>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial color="#f4f1e8" transparent opacity={0.075} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

const domeVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const domeFrag = /* glsl */ `
  varying vec3 vDir;
  void main(){
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenith = vec3(0.039, 0.059, 0.118);
    vec3 horizon = vec3(0.082, 0.118, 0.208);
    vec3 col = mix(horizon, zenith, smoothstep(0.45, 0.95, h));
    float city = exp(-max(vDir.y, 0.0) * 9.0) * smoothstep(-0.25, 0.02, vDir.y);
    col += vec3(1.0, 0.55, 0.18) * city * 0.16;   // sodium glow of the city on the horizon
    gl_FragColor = vec4(col, 1.0);
  }`;

function Dome() {
  return (
    <mesh>
      <sphereGeometry args={[480, 48, 24]} />
      <shaderMaterial vertexShader={domeVert} fragmentShader={domeFrag} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

/** Tonight's real phase: illuminated fraction + which limb is lit. */
export function moonState(date = new Date()) {
  const ill = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const phase = Astronomy.MoonPhase(date); // 0 new → 90 first quarter → 180 full → 270 last quarter
  const waxing = phase < 180;
  const fraction = ill.phase_fraction;
  const name =
    fraction < 0.03 ? "New moon" : fraction > 0.97 ? "Full moon" : phase < 90 ? "Waxing crescent" : phase < 180 ? (fraction > 0.5 ? "Waxing gibbous" : "First quarter") : phase < 270 ? (fraction > 0.5 ? "Waning gibbous" : "Last quarter") : "Waning crescent";
  return { phaseAngle: ill.phase_angle, fraction, waxing, name };
}

function Moon({ quality }: { quality: "high" | "low" }) {
  const [color, normal] = useLoader(THREE.TextureLoader, [quality === "low" ? "/tex/moon-color-1k.jpg" : "/tex/moon-color-2k.jpg", "/tex/moon-normal-1k.png"]);
  const { camera, size } = useThree();
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const st = useMemo(() => moonState(), []);
  useEffect(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 4;
  }, [color]);

  useFrame(() => {
    const g = group.current;
    const l = light.current;
    if (!g || !l) return;
    // Fixed framing in the view (upper right on desktop, high centre on phones); real phase lighting.
    const mobile = size.width < 768;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const pos = camera.position.clone().add(fwd.clone().multiplyScalar(70)).add(right.clone().multiplyScalar(mobile ? 11.5 : 36)).add(up.clone().multiplyScalar(mobile ? 30 : 24));
    g.position.copy(pos);
    const toCam = camera.position.clone().sub(pos).normalize();
    const side = right.clone().multiplyScalar(st.waxing ? 1 : -1);
    const pa = st.phaseAngle * DEG;
    const sunDir = toCam.clone().multiplyScalar(Math.cos(pa)).add(side.multiplyScalar(Math.sin(pa))).normalize();
    l.position.copy(pos.clone().add(sunDir.multiplyScalar(50)));
    l.target.position.copy(pos);
    l.target.updateMatrixWorld();
    g.rotation.y += 0.00012;
  });

  return (
    <>
      <directionalLight ref={light} intensity={3.1} color="#fff6e6" />
      <group ref={group}>
        <mesh rotation={[0.2, -0.6, 0]}>
          <sphereGeometry args={[size.width < 768 ? 3.4 : 5.2, 96, 64]} />
          {/* Earthshine: near new moon the night side glows faintly with light reflected from Earth (the "ashen light"). */}
          <meshStandardMaterial map={color} normalMap={normal} normalScale={new THREE.Vector2(1.15, 1.15)} roughness={1} metalness={0} emissive="#9aa8d6" emissiveMap={color} emissiveIntensity={0.05 + (1 - st.fraction) * 0.16} />
        </mesh>
        <sprite scale={[size.width < 768 ? 22 : 30, size.width < 768 ? 22 : 30, 1]}>
          <spriteMaterial map={glowTexture()} color="#cfd8ff" transparent opacity={0.07 + st.fraction * 0.24} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
    </>
  );
}

let _glow: THREE.Texture | null = null;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.18, "rgba(255,255,255,0.45)");
  r.addColorStop(0.5, "rgba(255,255,255,0.08)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

/** Deterministic pseudo-random from a tx hash. */
function seeded(tx: string) {
  let h = 2166136261;
  for (let i = 2; i < tx.length; i++) h = Math.imul(h ^ tx.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const meteorVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const meteorFrag = /* glsl */ `
  varying vec2 vUv; uniform float uLife;
  void main(){
    float along = vUv.x;                       // 0 tail → 1 head
    float across = abs(vUv.y - 0.5) * 2.0;
    float body = pow(along, 2.4) * (1.0 - smoothstep(0.0, 1.0, across));
    float head = exp(-pow((1.0 - along) * 18.0, 2.0)) * (1.0 - across);
    float fade = smoothstep(0.0, 0.12, uLife) * (1.0 - smoothstep(0.62, 1.0, uLife));
    vec3 col = mix(vec3(1.0, 0.56, 0.14), vec3(1.0, 0.93, 0.78), head);
    gl_FragColor = vec4(col, (body * 0.9 + head) * fade);
  }`;

type Live = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; start: THREE.Vector3; dir: THREE.Vector3; born: number; dur: number; len: number };

function Meteors({ events, reduce }: { events: SkyEvent[]; reduce: boolean }) {
  const { scene, clock } = useThree();
  const seen = useRef(new Set<string>());
  const queue = useRef<{ tx: string; at: number }[]>([]);
  const live = useRef<Live[]>([]);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), []);

  useEffect(() => {
    const now = clock.elapsedTime;
    const fresh = events.filter((e) => !seen.current.has(e.tx));
    const firstLoad = seen.current.size === 0;
    const pick = firstLoad ? fresh.slice(0, 24).reverse() : fresh;
    pick.forEach((e, i) => {
      seen.current.add(e.tx);
      queue.current.push({ tx: e.tx, at: now + (firstLoad ? 0.8 + i * 0.36 + seeded(e.tx)() * 0.25 : 0.2 + i * 0.5) });
    });
    for (const e of fresh) seen.current.add(e.tx);
  }, [events, clock]);

  useEffect(() => () => {
    for (const m of live.current) {
      scene.remove(m.mesh);
      m.mat.dispose();
    }
    geo.dispose();
  }, [scene, geo]);

  useFrame((st) => {
    const t = st.clock.elapsedTime;
    while (queue.current.length && queue.current[0]!.at <= t) {
      const { tx } = queue.current.shift()!;
      const r = seeded(tx);
      const az = VIEW_AZ - 55 + r() * 110;
      const alt = 38 + r() * 34;
      const start = altAzToVec(alt, az, 300);
      const ang = (200 + r() * 50) * DEG;
      const tangentE = new THREE.Vector3(Math.cos(az * DEG), 0, -Math.sin(az * DEG));
      const up = new THREE.Vector3(0, 1, 0);
      const dir = tangentE.multiplyScalar(Math.cos(ang)).add(up.multiplyScalar(Math.sin(ang))).normalize();
      const mat = new THREE.ShaderMaterial({ vertexShader: meteorVert, fragmentShader: meteorFrag, uniforms: { uLife: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      live.current.push({ mesh, mat, start, dir, born: t, dur: reduce ? 999 : 1.15 + r() * 0.5, len: 26 + r() * 22 });
    }
    for (let i = live.current.length - 1; i >= 0; i--) {
      const m = live.current[i]!;
      const life = reduce ? 0.5 : (t - m.born) / m.dur;
      if (life >= 1) {
        scene.remove(m.mesh);
        m.mat.dispose();
        live.current.splice(i, 1);
        continue;
      }
      m.mat.uniforms.uLife!.value = life;
      const travel = reduce ? 30 : 10 + life * 70;
      const head = m.start.clone().add(m.dir.clone().multiplyScalar(travel));
      const tail = head.clone().sub(m.dir.clone().multiplyScalar(m.len * Math.min(1, life * 2.4 + 0.15)));
      const mid = head.clone().add(tail).multiplyScalar(0.5);
      m.mesh.position.copy(mid);
      m.mesh.lookAt(st.camera.position);
      const toHead = head.clone().sub(tail);
      const camQ = m.mesh.quaternion.clone().invert();
      const local = toHead.clone().applyQuaternion(camQ);
      m.mesh.rotation.z += Math.atan2(local.y, local.x);
      m.mesh.scale.set(toHead.length(), 0.55, 1);
    }
  });
  return null;
}

function Rig({ reduce }: { reduce: boolean }) {
  const { camera, pointer } = useThree();
  const base = useMemo(() => altAzToVec(VIEW_ALT, VIEW_AZ, 1), []);
  useEffect(() => {
    camera.position.set(0, 0, 0);
    camera.lookAt(base);
  }, [camera, base]);
  const fine = useMemo(() => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches, []);
  useFrame((st) => {
    if (reduce) return;
    const t = st.clock.elapsedTime;
    const px = fine ? pointer.x : 0;
    const py = fine ? pointer.y : 0;
    const target = altAzToVec(VIEW_ALT + Math.sin(t * 0.05) * 0.6 + py * 1.6, VIEW_AZ + Math.sin(t * 0.031) * 1.2 + px * 2.4, 1);
    const cur = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    cur.lerp(target, 0.035);
    camera.lookAt(cur);
  });
  return null;
}

export default function NightSky({ events = [], className = "", quality: q, paused = false }: { events?: SkyEvent[]; className?: string; quality?: "high" | "low"; paused?: boolean }) {
  const reduce = Boolean(useReducedMotion());
  const data = useSkyData();
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [dpr, setDpr] = useState(1.25);
  const quality = useMemo<"high" | "low">(() => {
    if (q) return q;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return window.innerWidth < 768 || mem < 4 ? "low" : "high";
  }, [q]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const frameloop = reduce ? "demand" : paused || !inView ? "never" : "always";
  return (
    <div ref={wrap} className={`absolute inset-0 ${className}`} aria-hidden>
      <Canvas
        dpr={[1, dpr]}
        frameloop={frameloop}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
        camera={{ fov: 58, near: 0.1, far: 1000, position: [0, 0, 0] }}
        onCreated={({ gl }) => gl.setClearColor("#0A0F1E")}
      >
        <PerformanceMonitor onIncline={() => setDpr(1.5)} onDecline={() => setDpr(1)} flipflops={3} onFallback={() => setDpr(1)} />
        <Rig reduce={reduce} />
        <Dome />
        <ambientLight intensity={0.035} color="#6f7fb3" />
        {data && <Stars data={data} quality={quality} reduce={reduce} />}
        <Suspense fallback={null}>
          <Moon quality={quality} />
        </Suspense>
        <Meteors events={events} reduce={reduce} />
      </Canvas>
    </div>
  );
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
