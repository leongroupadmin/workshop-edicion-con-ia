import { Composition, registerRoot } from "remotion";
import { Clip } from "./Clip";
import type { ClipRenderProps } from "./types";
// Dedicated entry point: Edit's root and composition remain untouched.
const Root = () => (
  <Composition
    id="Clip"
    component={Clip}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{} as ClipRenderProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(
        1,
        Math.min(
          Math.floor(props.settings.maxSeconds * 30),
          Math.ceil((props.durationMs / 1000) * 30),
        ),
      ),
    })}
  />
);
registerRoot(Root);
