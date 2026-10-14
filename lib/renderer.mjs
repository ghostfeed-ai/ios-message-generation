// Shared by render-image.mjs and render-video.mjs: story loading, validation,
// and opening index.html in headless Chrome with the story injected.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright-core";

export const ChromePath = process.env.CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const readArgument = (Name, Fallback) => {
  const ArgumentIndex = process.argv.indexOf(Name);
  return ArgumentIndex >= 0 ? process.argv[ArgumentIndex + 1] : Fallback;
};

const MimeTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

// Local story images are embedded as data URLs so a render never depends on
// a web server or remote image host.
export const loadStory = async (StoryPath) => {
  const StoryDirectory = dirname(StoryPath);
  const Story = JSON.parse(await readFile(StoryPath, "utf8"));

  const inlineLocalImage = async (ImagePath) => {
    if (
      typeof ImagePath !== "string"
      || /^(?:data:|https?:|blob:|file:)/i.test(ImagePath)
    ) {
      return ImagePath;
    }
    const AbsoluteImagePath = resolve(StoryDirectory, ImagePath);
    const Extension = AbsoluteImagePath.slice(AbsoluteImagePath.lastIndexOf(".")).toLowerCase();
    const MimeType = MimeTypes.get(Extension);
    if (!MimeType) {
      throw new Error(`Unsupported image type for ${AbsoluteImagePath}`);
    }
    const ImageBytes = await readFile(AbsoluteImagePath);
    return `data:${MimeType};base64,${ImageBytes.toString("base64")}`;
  };
  const inlineLibraryItem = async (Item) => {
    if (typeof Item === "string") return inlineLocalImage(Item);
    return { ...Item, image: await inlineLocalImage(Item.image) };
  };

  Story.avatarImage = await inlineLocalImage(Story.avatarImage);
  Story.photoLibrary = await Promise.all((Story.photoLibrary ?? []).map(inlineLibraryItem));
  Story.galleryPool = await Promise.all((Story.galleryPool ?? []).map(inlineLibraryItem));
  Story.messages = await Promise.all((Story.messages ?? []).map(async (Message) => ({
    ...Message,
    image: await inlineLocalImage(Message.image),
    thumbnail: await inlineLocalImage(Message.thumbnail),
  })));

  Story.messages.forEach((Message, MessageIndex) => {
    const MessageKind = Message.kind ?? Message.type ?? "text";
    if (!["text", "image", "photo"].includes(MessageKind)) {
      throw new Error(`messages[${MessageIndex}].kind is not supported: ${MessageKind}`);
    }
    if (["image", "photo"].includes(MessageKind)) {
      if (Message.side !== "sent") {
        throw new Error(`messages[${MessageIndex}] image flows currently require side "sent"`);
      }
      if (!Message.image && !Message.thumbnail) {
        throw new Error(`messages[${MessageIndex}] image flow requires an image path`);
      }
      if (Message.sendVia && !["camera", "photos"].includes(Message.sendVia)) {
        throw new Error(`messages[${MessageIndex}].sendVia must be "camera" or "photos"`);
      }
    } else if (typeof Message.text !== "string") {
      throw new Error(`messages[${MessageIndex}] text message requires text`);
    }
  });
  return Story;
};

export const storyViewport = (Story) => {
  const Viewport = {
    width: Story.viewport?.width ?? 720,
    height: Story.viewport?.height ?? 1280,
  };
  for (const [DimensionName, DimensionValue] of Object.entries(Viewport)) {
    if (
      !Number.isInteger(DimensionValue)
      || DimensionValue < 320
      || DimensionValue > 4096
      || DimensionValue % 2 !== 0
    ) {
      throw new Error(
        `viewport.${DimensionName} must be an even integer between 320 and 4096`
      );
    }
  }
  return Viewport;
};

// Opens the renderer paused at t=0. Drive it with
// Page.evaluate((Seconds) => window.__renderAt(Seconds), Time).
export const openRenderer = async (Story, { deviceScaleFactor = 1 } = {}) => {
  const Browser = await chromium.launch({
    executablePath: ChromePath,
    headless: true,
  });
  const Context = await Browser.newContext({
    viewport: storyViewport(Story),
    deviceScaleFactor,
  });
  await Context.addInitScript((StoryConfig) => {
    window.__CHAT_STORY__ = StoryConfig;
  }, Story);
  const Page = await Context.newPage();
  const RendererUrl = new URL("../index.html", import.meta.url);
  RendererUrl.searchParams.set("t", "0");
  await Page.goto(RendererUrl.href);
  await Page.evaluate(() => window.__assetsReady);
  const close = async () => {
    await Page.close();
    await Context.close();
    await Browser.close();
  };
  return { Page, close };
};
