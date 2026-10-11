import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Fragment, type FC } from "react";
import { AbsoluteFill, Audio, type CalculateMetadataFunction, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { Captions, Finish } from "./components/ui";
import { S1, S2, S3 } from "./scenes/Act1";
import { S4, S5, S6 } from "./scenes/Act2";
import { S7, S8, S9, S10 } from "./scenes/Act3";
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
          <Audio src={staticFile(`vo/${SCENES[i]!.id}.mp3`)} />
        </Sequence>
      )}
      {captions && <Captions vo={SCENES[i]!.vo} dur={dur} lead={LEAD} tail={TAIL} />}
    </AbsoluteFill>
  );
}

export function Main({ durations, hasVo, music, captions }: MainProps) {
  const { durationInFrames } = useVideoConfig();
  const anyVo = hasVo.some(Boolean);
  const base = anyVo ? 0.13 : 0.34;
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
          volume={(f) => interpolate(f, [0, 45, durationInFrames - 75, durationInFrames - 5], [0, base, base, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
      <Finish />
    </AbsoluteFill>
  );
}
