import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Fragment, type FC, useMemo } from "react";
import { AbsoluteFill, Audio, type CalculateMetadataFunction, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { Captions, Finish } from "./components/ui";
import { S1, S2, S3 } from "./scenes/Act1";
import { S4, S5, S6 } from "./scenes/Act2";
import { S7, S8, S9, S10 } from "./scenes/Act3";
import { aligned, speaking } from "./cues";
import { SCENES } from "./script";
import { FPS } from "./theme";

export const SCENE_COMPONENTS: FC<{ dur: number }>[] = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10];
/** Voice starts 0.3 s into its scene and the scene holds 0.7 s after it ends; scenes cross-fade over 0.5 s. */
export const LEAD = 9;
export const TAIL = 21;
export const XFADE = 15;

export type MainProps = { durations: number[]; hasVo: boolean[]; music: string; captions: boolean };

export const calculateMainMetadata: CalculateMetadataFunction<MainProps> = async ({ props }) => {
  const found = await Promise.all(
    SCENES.map(async (s) => {
      try {
        return await getAudioDurationInSeconds(staticFile(`vo/${s.id}.mp3`));
      } catch {
        return null;
      }
    }),
  );
  const durations = SCENES.map((s, i) => (found[i] != null ? Math.ceil(found[i]! * FPS) + LEAD + TAIL : s.estimate * FPS));
  const total = durations.reduce((a, b) => a + b, 0) - XFADE * (durations.length - 1);
  return { durationInFrames: total, props: { ...props, durations, hasVo: found.map((x) => x != null) } };
};

/** One scene with its voice and captions. */
export function SceneWithVoice({ i, dur, hasVo, captions }: { i: number; dur: number; hasVo: boolean; captions: boolean }) {
  const Scene = SCENE_COMPONENTS[i]!;
  return (
    <AbsoluteFill>
      <Scene dur={dur} />
      {hasVo && (
        <Sequence from={LEAD}>
          {/* loudness-normalised copy (-16 LUFS) made by scripts/align.mjs; the raw file if it isn't there */}
          <Audio src={staticFile(aligned(SCENES[i]!.id) ? `vo-norm/${SCENES[i]!.id}.wav` : `vo/${SCENES[i]!.id}.mp3`)} />
        </Sequence>
      )}
      {captions && <Captions id={SCENES[i]!.id} vo={SCENES[i]!.vo} dur={dur} lead={LEAD} tail={TAIL} />}
    </AbsoluteFill>
  );
}

/** Music level per frame: a bed between lines, ducked under the voice (smoothed so it breathes, not pumps). */
function musicCurve(durations: number[], hasVo: boolean[], total: number): number[] {
  const BED = 0.3;
  const DUCK = 0.12;
  const anyVo = hasVo.some(Boolean);
  const target = new Array<number>(total).fill(anyVo ? BED : 0.34);
  if (anyVo) {
    let start = 0;
    durations.forEach((d, i) => {
      const id = SCENES[i]!.id;
      for (let f = 0; f < d; f++) if (hasVo[i] && speaking(id, f / FPS) && start + f < total) target[start + f] = DUCK;
      start += d - XFADE;
    });
  }
  // attack ~0.2 s down, release ~0.6 s up
  const out = new Array<number>(total);
  let v = target[0] ?? BED;
  for (let f = 0; f < total; f++) {
    const t = target[f]!;
    v += (t - v) * (t < v ? 0.18 : 0.06);
    out[f] = v;
  }
  return out;
}

export function Main({ durations, hasVo, music, captions }: MainProps) {
  const { durationInFrames } = useVideoConfig();
  const curve = useMemo(() => musicCurve(durations, hasVo, durationInFrames), [durations, hasVo, durationInFrames]);
  return (
    <AbsoluteFill style={{ background: "#0A0F1E" }}>
      <TransitionSeries>
        {durations.map((d, i) => (
          <Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={d}>
              <SceneWithVoice i={i} dur={d} hasVo={hasVo[i] ?? false} captions={captions} />
            </TransitionSeries.Sequence>
            {i < durations.length - 1 && <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: XFADE })} />}
          </Fragment>
        ))}
      </TransitionSeries>
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          volume={(f) => (curve[f] ?? 0) * interpolate(f, [0, 45, durationInFrames - 90, durationInFrames - 4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
      <Finish />
    </AbsoluteFill>
  );
}
