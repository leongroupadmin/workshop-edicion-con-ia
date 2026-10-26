import "./index.css";
import { CalculateMetadataFunction, Composition, Folder } from "remotion";
import { Edit } from "./edit/Edit";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { Title } from "./HelloWorld/Title";
import {
  DEFAULT_BRAND,
  DEFAULT_SETTINGS,
  FORMAT_SIZE,
  type EditProps,
} from "./pipeline/types";

// Montaje final del pipeline: lo renderiza scripts/render.ts con las props del proyecto.
const calculateEditMetadata: CalculateMetadataFunction<EditProps> = ({ props }) => {
  const { width, height } = FORMAT_SIZE[props.settings.format];
  const fps = props.settings.fps || 30;
  return {
    width,
    height,
    fps,
    durationInFrames: Math.max(1, Math.ceil((props.durationMs / 1000) * fps)),
  };
};

const editDefaults: EditProps = {
  projectId: "",
  baseUrl: "",
  cutVideo: "",
  durationMs: 3000,
  sourceWidth: 1080,
  sourceHeight: 1920,
  words: [],
  plan: null,
  settings: DEFAULT_SETTINGS,
  brand: DEFAULT_BRAND,
  musicFile: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Edit"
        component={Edit}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={editDefaults}
        calculateMetadata={calculateEditMetadata}
      />
      <Folder name="Ejemplos">
        <Composition
          id="HelloWorld"
          component={HelloWorld}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            titleText: "Welcome to Remotion",
            titleColor: "#000000",
          }}
        />
        <Composition
          id="Logo"
          component={Logo}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            logoColor1: "#91EAE4",
            logoColor2: "#86A8E7",
          }}
        />
        <Composition
          id="Title"
          component={Title}
          durationInFrames={115}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            titleText: "Welcome to Remotion",
            titleColor: "#000000",
          }}
        />
      </Folder>
    </>
  );
};
