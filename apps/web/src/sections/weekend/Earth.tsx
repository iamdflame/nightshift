/**
 * The Earth with its true day/night terminator for any instant: NASA Blue Marble (day) and Black Marble
 * (night lights, tinted sodium) blended by the real subsolar point (astronomy-engine). New York is marked;
 * it glows amber while it's dark. The instant comes from a ref the scroll chapter writes (no re-renders).
 */
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as Astronomy from "astronomy-engine";
import { type MutableRefObject, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

const DEG = Math.PI / 180;
const NY = { lat: 40.7128, lon: -74.006 };

/** Direction for (lat, lon) in three.js SphereGeometry's UV frame (equirectangular, lon −180 at −x). */
export function latLonToVec(lat: number, lon: number, r = 1): THREE.Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const c = Math.cos(lat * DEG);
  return new THREE.Vector3(-Math.cos(phi) * c * r, Math.sin(lat * DEG) * r, Math.sin(phi) * c * r);
}

/** Subsolar point at `ms`: declination and the longitude where the Sun is overhead. */
export function subsolar(ms: number): { lat: number; lon: number } {
  const date = new Date(ms);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, new Astronomy.Observer(0, 0, 0), true, true);
  const gast = Astronomy.SiderealTime(date);
  let lon = (eq.ra - gast) * 15;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: eq.dec, lon };
}

export const isDarkAt = (lat: number, lon: number, ms: number) => latLonToVec(lat, lon).dot(latLonToVec(subsolar(ms).lat, subsolar(ms).lon)) < -0.02;

const vert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main(){
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const frag = /* glsl */ `
  uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main(){
    float d = dot(normalize(vN), normalize(uSun));
    float lit = smoothstep(-0.06, 0.14, d);
    vec3 day = texture2D(uDay, vUv).rgb * 0.92;
    vec3 night = texture2D(uNight, vUv).rgb;
    float lights = pow(clamp(dot(night, vec3(0.33)), 0.0, 1.0), 1.35);
    vec3 city = vec3(1.0, 0.68, 0.30) * lights * 2.2 + vec3(0.016, 0.024, 0.05);
    vec3 col = mix(city, day, lit);
    col += vec3(1.0, 0.5, 0.2) * 0.10 * exp(-pow(d * 8.0, 2.0));        // dusk band along the terminator
    float rim = pow(1.0 - max(dot(normalize(vN), vView), 0.0), 3.0);
    col += vec3(0.42, 0.55, 0.95) * rim * (0.25 + 0.55 * lit);           // thin atmosphere at the limb
    gl_FragColor = vec4(col, 1.0);
  }`;

function Globe({ timeRef, mobile }: { timeRef: MutableRefObject<number>; mobile: boolean }) {
  const [day, night] = useLoader(THREE.TextureLoader, [mobile ? "/tex/earth-day-2k.jpg" : "/tex/earth-day-4k.jpg", "/tex/earth-night-2k.jpg"]);
  day.anisotropy = 8;
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  const mat = useRef<THREE.ShaderMaterial>(null);
  const marker = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ny = useMemo(() => latLonToVec(NY.lat, NY.lon, 1.006), []);
  const uniforms = useMemo(() => ({ uDay: { value: day }, uNight: { value: night }, uSun: { value: new THREE.Vector3(1, 0, 0) } }), [day, night]);

  useFrame((st) => {
    const s = subsolar(timeRef.current);
    const sun = latLonToVec(s.lat, s.lon);
    if (mat.current) mat.current.uniforms.uSun!.value.copy(sun);
    const dark = ny.clone().normalize().dot(sun) < -0.02;
    if (marker.current) (marker.current.material as THREE.MeshBasicMaterial).color.set(dark ? "#FFB23F" : "#F4F1E8");
    if (ring.current) {
      const k = (st.clock.elapsedTime % 2.2) / 2.2;
      ring.current.scale.setScalar(1 + k * 3.2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = dark ? 0.55 * (1 - k) : 0;
      ring.current.lookAt(ny.clone().multiplyScalar(3));
    }
  });

  return (
    <group rotation={[0, 0, 0]}>
      <mesh>
        <sphereGeometry args={[1, mobile ? 64 : 128, mobile ? 48 : 96]} />
        <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} />
      </mesh>
      <mesh ref={marker} position={ny}>
        <sphereGeometry args={[0.0085, 16, 12]} />
        <meshBasicMaterial color="#FFB23F" />
      </mesh>
      <mesh ref={ring} position={ny}>
        <ringGeometry args={[0.016, 0.022, 40]} />
        <meshBasicMaterial color="#FFB23F" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Camera({ mobile }: { mobile: boolean }) {
  useFrame(({ camera }) => {
    const p = latLonToVec(28, -80, mobile ? 3.6 : 3.25);
    camera.position.copy(p);
    camera.lookAt(mobile ? 0 : -0.42, mobile ? 0.1 : 0.06, 0);
  });
  return null;
}

export default function Earth({ timeRef, active, mobile }: { timeRef: MutableRefObject<number>; active: boolean; mobile: boolean }) {
  return (
    <Canvas dpr={[1, 1.5]} frameloop={active ? "always" : "demand"} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} camera={{ fov: 34, near: 0.1, far: 50 }} aria-hidden>
      <Camera mobile={mobile} />
      <Suspense fallback={null}>
        <Globe timeRef={timeRef} mobile={mobile} />
      </Suspense>
    </Canvas>
  );
}
