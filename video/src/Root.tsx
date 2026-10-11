import { Composition } from "remotion";
import { aligned } from "./cues";
import { calculateMainMetadata, LEAD, Main, type MainProps, SceneWithVoice, TAIL } from "./Main";
import { SCENES } from "./script";
import { Thumbnail } from "./Thumbnail";
import { FPS, loadFonts } from "./theme";

loadFonts();

const estimates = SCENES.map((s) => s.estimate * FPS);
/** Each scene's length in the final cut: its voice (+ lead and tail) when aligned, else the estimate. */
const sceneDur = SCENES.map((s, i) => {
  const a = aligned(s.id);
  return a ? Math.ceil(a.dur * FPS) + LEAD + TAIL : estimates[i]!;
});

export function Root() {
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={estimates.reduce((a, b) => a + b, 0)}
        defaultProps={{ durations: estimates, hasVo: estimates.map(() => false), music: "music/moon-walk-norm.wav", captions: true } satisfies MainProps}
        calculateMetadata={calculateMainMetadata}
      />
      <Composition id="Thumbnail" component={Thumbnail} width={1280} height={720} fps={FPS} durationInFrames={1} />
      {SCENES.map((s, i) => (
        <Composition
          key={s.id}
          id={s.id.toUpperCase()}
          component={SceneWithVoice}
          width={1920}
          height={1080}
          fps={FPS}
          durationInFrames={sceneDur[i]!}
          defaultProps={{ i, dur: sceneDur[i]!, hasVo: Boolean(aligned(s.id)), captions: true }}
        />
      ))}
    </>
  );
}
