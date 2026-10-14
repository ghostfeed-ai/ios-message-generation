// Renders a story to a 30 fps H.264 MP4, with optional Messages sounds.
//
//   node render-video.mjs --story story-folk-bill.json --output folk-bill.mp4
//   node render-video.mjs --story ... --output ... --sparse   (only capture state changes; much faster)
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadStory, openRenderer, readArgument } from "./lib/renderer.mjs";

const CurrentDirectory = dirname(fileURLToPath(import.meta.url));
const OutputDirectory = join(CurrentDirectory, "output");
const SentMessageSoundPath = "/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/SentMessage.caf";
const ReceivedMessageSoundPath = "/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/AlertTones/ReceivedMessage.caf";
const FramesPerSecond = 30;
const StoryPath = resolve(process.cwd(), readArgument("--story", join(CurrentDirectory, "story-media.json")));
const OutputFileName = readArgument("--output", "ios26-imessage-proof.mp4");
if (!/^[a-z0-9][a-z0-9._-]*\.mp4$/i.test(OutputFileName)) {
  throw new Error(`Invalid output filename: ${OutputFileName}`);
}
const OutputStem = OutputFileName.replace(/\.mp4$/i, "");
const FramesDirectory = join(OutputDirectory, `.frames-${OutputStem}`);
const AudioDirectory = join(OutputDirectory, `.audio-${OutputStem}`);
const SparseCapture = process.argv.includes("--sparse");
const Story = await loadStory(StoryPath);

await mkdir(OutputDirectory, { recursive: true });
await rm(FramesDirectory, { recursive: true, force: true });
await rm(AudioDirectory, { recursive: true, force: true });
await mkdir(FramesDirectory, { recursive: true });
await mkdir(AudioDirectory, { recursive: true });

const SoundFiles = [];
if (Story.sounds?.enabled) {
  Story.messages.forEach((Message, MessageIndex) => {
    const IsSent = Message.side === "sent";
    SoundFiles.push({
      MessageIndex,
      SoundPath: IsSent ? SentMessageSoundPath : ReceivedMessageSoundPath,
      Volume: IsSent
        ? (Story.sounds.sentVolume ?? .7)
        : (Story.sounds.receivedVolume ?? .65),
    });
  });
}

const { Page, close } = await openRenderer(Story);
const RenderMetadata = await Page.evaluate(() => ({
  duration: window.__renderDuration,
  soundSchedule: window.__soundSchedule,
  schedule: window.__renderSchedule,
}));
const DurationSeconds = RenderMetadata.duration;
if (SparseCapture) {
  await Page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  const TransitionDuration = Story.progressiveBlurMode
    ? (Story.progressiveUnblurDuration ?? .22)
    : 0;
  const TransitionFrames = TransitionDuration > 0
    ? RenderMetadata.schedule.flatMap(({ phaseStart }) =>
      Array.from(
        { length: Math.ceil(TransitionDuration * FramesPerSecond) },
        (_, FrameIndex) => phaseStart + (FrameIndex / FramesPerSecond),
      )
    )
    : [];
  const CaptureTimes = [...new Set([
    0,
    ...RenderMetadata.schedule.map(({ phaseStart }) => phaseStart),
    ...TransitionFrames,
  ])]
    .filter((Time) => Time < DurationSeconds)
    .sort((Left, Right) => Left - Right);
  const ConcatLines = [];
  for (let CaptureIndex = 0; CaptureIndex < CaptureTimes.length; CaptureIndex += 1) {
    const FrameTime = CaptureTimes[CaptureIndex];
    const FrameName = `state-${String(CaptureIndex).padStart(4, "0")}.png`;
    const FramePath = join(FramesDirectory, FrameName);
    await Page.evaluate((Seconds) => window.__renderAt(Seconds), FrameTime);
    await Page.screenshot({ path: FramePath });
    const NextTime = CaptureTimes[CaptureIndex + 1] ?? DurationSeconds;
    ConcatLines.push(`file '${FramePath}'`, `duration ${NextTime - FrameTime}`);
  }
  const LastFramePath = join(FramesDirectory, `state-${String(CaptureTimes.length - 1).padStart(4, "0")}.png`);
  ConcatLines.push(`file '${LastFramePath}'`);
  await writeFile(join(FramesDirectory, "frames.txt"), `${ConcatLines.join("\n")}\n`);
} else {
  const FrameCount = Math.ceil(DurationSeconds * FramesPerSecond);
  for (let FrameIndex = 0; FrameIndex < FrameCount; FrameIndex += 1) {
    const FrameTime = FrameIndex / FramesPerSecond;
    await Page.evaluate((Seconds) => window.__renderAt(Seconds), FrameTime);
    const FrameName = `frame-${String(FrameIndex).padStart(4, "0")}.png`;
    await Page.screenshot({ path: join(FramesDirectory, FrameName) });
  }
}
await close();

const SilentMp4Path = join(OutputDirectory, `.${OutputStem}-silent.mp4`);
execFileSync(
  "ffmpeg",
  SparseCapture
    ? [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(FramesDirectory, "frames.txt"),
      "-t",
      String(DurationSeconds),
      "-r",
      String(FramesPerSecond),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      SilentMp4Path,
    ]
    : [
      "-y",
      "-framerate",
      String(FramesPerSecond),
      "-i",
      join(FramesDirectory, "frame-%04d.png"),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    SilentMp4Path,
    ],
  { stdio: "ignore" },
);

if (SparseCapture) {
  const ExtendedSilentMp4Path = join(OutputDirectory, `.${OutputStem}-sparse-extended.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      SilentMp4Path,
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${DurationSeconds}`,
      "-t",
      String(DurationSeconds),
      "-r",
      String(FramesPerSecond),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      ExtendedSilentMp4Path,
    ],
    { stdio: "ignore" },
  );
  await rm(SilentMp4Path, { force: true });
  await rename(ExtendedSilentMp4Path, SilentMp4Path);
}

const Mp4Path = join(OutputDirectory, OutputFileName);
if (SoundFiles.length > 0) {
  const AudioInputArguments = SoundFiles.flatMap(({ SoundPath }) => ["-i", SoundPath]);
  const AudioFilterParts = SoundFiles.map(({ MessageIndex, Volume }, SoundIndex) => {
    const SoundStart = RenderMetadata.soundSchedule.find(
      (ScheduledSound) => ScheduledSound.index === MessageIndex
    )?.soundStart ?? 0;
    const DelayMilliseconds = Math.round(SoundStart * 1000);
    return `[${SoundIndex + 1}:a]adelay=${DelayMilliseconds}:all=1,volume=${Volume}[sound${SoundIndex}]`;
  });
  const MixedSoundInputs = SoundFiles.map((_, SoundIndex) => `[sound${SoundIndex}]`).join("");
  AudioFilterParts.push(
    `${MixedSoundInputs}amix=inputs=${SoundFiles.length}:duration=longest:normalize=0,alimiter=limit=0.95:attack=5:release=50[mixed]`
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      SilentMp4Path,
      ...AudioInputArguments,
      "-filter_complex",
      AudioFilterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[mixed]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(DurationSeconds),
      "-movflags",
      "+faststart",
      Mp4Path,
    ],
    { stdio: "ignore" },
  );
} else {
  await rm(Mp4Path, { force: true });
  await rename(SilentMp4Path, Mp4Path);
}

await rm(SilentMp4Path, { force: true });
await rm(FramesDirectory, { recursive: true, force: true });
await rm(AudioDirectory, { recursive: true, force: true });
console.log(Mp4Path);
