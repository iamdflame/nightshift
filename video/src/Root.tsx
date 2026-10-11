import { Composition } from "remotion";
import { calculateMainMetadata, Main, type MainProps, SceneWithVoice } from "./Main";
import { SCENES } from "./script";
import { Thumbnail } from "./Thumbnail";
import { FPS, loadFonts } from "./theme";

loadFonts();

const estimates = SCENES.map((s) => s.estimate * FPS);

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
        defaultProps={{ durations: estimates, hasVo: estimates.map(() => false), music: "music/moon-walk.mp3", captions: true } satisfies MainProps}
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
          durationInFrames={s.estimate * FPS}
          defaultProps={{ i, dur: s.estimate * FPS, hasVo: false, captions: true }}
        />
      ))}
    </>
  );
}
