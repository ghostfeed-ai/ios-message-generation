// Renders one PNG of a story: by default the finished conversation, or the
// screen at --at <seconds>.
//
//   node render-image.mjs --story story-folk-bill.json --output folk-bill.png --scale 2
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadStory, openRenderer, readArgument } from "./lib/renderer.mjs";

const CurrentDirectory = dirname(fileURLToPath(import.meta.url));
const OutputDirectory = join(CurrentDirectory, "output");
const StoryPath = resolve(process.cwd(), readArgument("--story", join(CurrentDirectory, "story-folk.json")));
const OutputFileName = readArgument("--output", "ios26-imessage.png");
if (!/^[a-z0-9][a-z0-9._-]*\.png$/i.test(OutputFileName)) {
  throw new Error(`Invalid output filename: ${OutputFileName}`);
}
const Scale = Number(readArgument("--scale", "1"));
if (!(Scale > 0 && Scale <= 4)) {
  throw new Error("--scale must be between 0 and 4");
}
const AtArgument = readArgument("--at");
const AtSeconds = AtArgument === undefined ? null : Number(AtArgument);
if (AtSeconds !== null && !Number.isFinite(AtSeconds)) {
  throw new Error(`--at must be a number of seconds: ${AtArgument}`);
}

const Story = await loadStory(StoryPath);
await mkdir(OutputDirectory, { recursive: true });
const { Page, close } = await openRenderer(Story, { deviceScaleFactor: Scale });
const Duration = await Page.evaluate(() => window.__renderDuration);
// The last instant of the timeline: every message delivered, keyboard down.
const FrameTime = AtSeconds ?? Math.max(0, Duration - .01);
await Page.evaluate((Seconds) => window.__renderAt(Seconds), FrameTime);
const ImagePath = join(OutputDirectory, OutputFileName);
await Page.screenshot({ path: ImagePath });
await close();
console.log(ImagePath);
