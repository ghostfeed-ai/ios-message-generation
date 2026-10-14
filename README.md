# iOS Message Generation

A deterministic renderer for light-mode, iOS-style Messages conversations.
Stories are JSON files; one renderer page (`index.html`) draws the phone screen,
and two thin entry points turn it into either output:

| Output | Script | What it does |
| --- | --- | --- |
| **Image** (PNG) | `render-image.mjs` | Renders the story once at a single moment (default: the finished conversation) and screenshots it. |
| **Video** (MP4) | `render-video.mjs` | Screenshots every frame at 30 fps, encodes H.264 with ffmpeg, and mixes in message sounds. |

Both share `lib/renderer.mjs` (story loading, validation, headless Chrome).
`capture.mjs` is kept as an alias for `render-video.mjs`.

The renderer supports:

- sent and received text bubbles;
- typing indicators and the iOS keyboard;
- Delivered-to-Read receipt transitions;
- the Messages attachment menu;
- inline Photos selection and photo messages;
- a full-screen Camera capture/review/send flow;
- focus, progressive-blur and compact-lyric reading modes;
- mid-conversation clock changes (`timeChanges`);
- configurable timing, viewport, status bar, battery, contact, and sound settings;
- deterministic, frame-by-frame rendering at 30 fps.

No personal conversation, personal photo-library asset, or supplied screen
recording is included in this repository.

## Requirements

- Node.js 18 or newer
- pnpm
- Google Chrome. The default path is `/Applications/Google Chrome.app`; set
  `CHROME_PATH` to use another install.
- Video only: macOS and `ffmpeg` on `PATH`. The message sounds use the macOS
  Messages system sounds; set `sounds.enabled` to `false` to render without them.

## Install

```bash
pnpm install
```

## Images

```bash
pnpm image -- --story story-folk-bill.json --output folk-bill.png
```

Writes `output/folk-bill.png`. Options:

- `--scale 2` (or `3`) renders at retina resolution, e.g. 1440×2560 for the
  default 720×1280 viewport.
- `--at 4.5` captures the screen at 4.5 seconds into the timeline instead of
  the finished conversation (useful for mid-typing or keyboard-up shots).

Timing fields in the story (`gap`, `typingDuration`, sounds, …) are ignored for
images except to decide what is on screen at `--at`.

## Video

```bash
pnpm video -- --story story-folk.json --output folk-sushi-imessage.mp4
```

With no arguments, renders `story-media.json` to
`output/ios26-imessage-proof.mp4`. Add `--sparse` to capture only the frames
where something changes; it is much faster for text-only stories.

The output filename must end in `.png` / `.mp4` and contain only letters,
numbers, periods, underscores, or hyphens.

## Preview studio

```bash
pnpm studio
```

Then open <http://localhost:4173/studio.html>. The left panel loads a story
preset, exposes quick fields (contact, status time, battery, unread badge,
silent mode, gallery seed) plus the full story JSON, and `Apply & Restart`
re-renders the phone-framed mobile preview on the right. The transport bar
supports play/pause, restart, and timeline scrubbing.

## Included stories

- `story-media.json` demonstrates the Photos and Camera attachment flows.
- `story-folk.json` demonstrates a text-only conversation.

The `examples/` directory contains rendered versions of both stories.

## Story model

Text messages and media messages share one ordered `messages` array:

```json
{
  "viewport": { "width": 720, "height": 1560 },
  "contactName": "folk",
  "avatarImage": "./assets/folk-icon.png",
  "messages": [
    { "side": "received", "text": "send me your out-of-office proof" },
    {
      "side": "sent",
      "kind": "image",
      "sendVia": "photos",
      "image": "./assets/photo-eiffel-tower.png",
      "libraryIndex": 0
    }
  ]
}
```

Local story images are embedded as data URLs before the browser opens, so a
render does not depend on a web server or remote image host.

## Assets and attribution

- The four demonstration photos are original generated placeholders. Their
  exact prompts and SHA-256 checksums are in
  [`assets/PHOTO_ASSETS.md`](assets/PHOTO_ASSETS.md).
- The Messages menu icons use Apple-published reference assets. Exact source
  URLs and checksums are in
  [`assets/menu-icons/README.md`](assets/menu-icons/README.md).
- Additional attribution and trademark notes are in
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

This repository intentionally has no open-source license. Do not assume that
third-party names, icons, or trademarks are licensed for redistribution outside
the authorized project.
