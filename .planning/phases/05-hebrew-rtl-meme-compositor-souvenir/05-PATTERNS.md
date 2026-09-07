# Phase 5: Hebrew RTL Meme Compositor & Souvenir - Pattern Map

**Mapped:** 2026-09-07
**Files analyzed:** 10 new/modified files
**Analogs found:** 8 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `client/src/screens/round/WritingPanel.tsx` | component | request-response | self (existing WritingPanel) | exact |
| `client/src/screens/round/RatingPanel.tsx` | component | request-response | self (existing RatingPanel) | exact |
| `client/src/screens/round/RoundEndPanel.tsx` | component | request-response | self (existing RoundEndPanel) | exact |
| `client/src/screens/round/GameEndPanel.tsx` | component | request-response | self (existing GameEndPanel) | exact |
| `shared/protocol.ts` | model | CRUD | self (existing protocol.ts) | exact |
| `server/src/rooms/Room.ts` | service | request-response | `submitCaption()` method | exact |
| `client/package.json` | config | — | self (existing package.json) | exact |
| `client/src/index.css` | config | — | self (existing index.css) | exact |
| `shared/messages.ts` | config | — | self (existing messages.ts) | exact |
| `server/src/app.ts` | config | request-response | self (existing app.ts Socket.IO setup) | exact |

---

## Pattern Assignments

### `client/src/screens/round/WritingPanel.tsx` (component, request-response)

**Current state:** Plain caption `<textarea>` + submit button with socket.once error/state round-trip pattern.

**Analog:** `client/src/screens/round/WritingPanel.tsx` (existing)

**Import pattern** (lines 1-9):
```typescript
import { useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type LobbySnapshot,
  type ProtocolError,
} from "@shared/protocol.js";
import { HEBREW_ERRORS, HEBREW_UI } from "@shared/messages.js";
import { getSocket } from "../../socket/connection";
```

**State shape** (lines 11-13):
```typescript
type WritingPanelProps = {
  snapshot: LobbySnapshot;
};
```

**Grapheme counting utility** (lines 21-37):
```typescript
const MAX_CAPTION_GRAPHEMES = 120;
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

function toGraphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((s) => s.segment);
}

function graphemesRemaining(value: string): number {
  return MAX_CAPTION_GRAPHEMES - toGraphemes(value).length;
}

function clampCaptionForInput(value: string): string {
  const graphemes = toGraphemes(value);
  if (graphemes.length <= MAX_CAPTION_GRAPHEMES) return value;
  return graphemes.slice(0, MAX_CAPTION_GRAPHEMES).join("");
}
```

**Socket round-trip submission pattern** (lines 53-75):
```typescript
function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(undefined);

  const socket = getSocket();
  const onError = (err: ProtocolError) => {
    setError(HEBREW_ERRORS[err.code]);
    cleanup();
  };
  const onState = () => {
    // Success — the next snapshot (already on its way) flips youSubmitted;
    // this screen has no optimistic mutation of its own.
    cleanup();
  };
  function cleanup() {
    socket.off(SERVER_EVENTS.error, onError);
    socket.off(SERVER_EVENTS.state, onState);
  }

  socket.once(SERVER_EVENTS.error, onError);
  socket.once(SERVER_EVENTS.state, onState);
  socket.emit(CLIENT_EVENTS.submitCaption, { text: caption });
}
```

**Notes for Phase 5 modification:**
- Reuse the `socket.once` cleanup pattern for the new meme submission
- Modify the event payload from `{ text: caption }` to `{ meme: base64PngString }`
- Keep the same error handling and success-wait-for-next-snapshot flow
- Add `canvas.toBlob()` + base64 encoding before emit
- Add `@fontsource/heebo` import and `await document.fonts.ready` before canvas rendering
- Grapheme counting per caption box (reuse `toGraphemes` for each box's text input)

---

### `client/src/screens/round/RatingPanel.tsx` (component, request-response)

**Current state:** Renders photo as `<img>` + caption as plain `<p>` text, with vote buttons.

**Analog:** `client/src/screens/round/RatingPanel.tsx` (existing)

**Current photo + caption rendering** (lines 68-69):
```typescript
<img className="meme-photo" src={ratingStep.photoUrl} alt={HEBREW_UI.photoAlt} />
<p>{ratingStep.caption}</p>
```

**Socket emission for rating** (lines 59):
```typescript
socket.emit(CLIENT_EVENTS.submitRating, { stepIndex, value });
```

**Notes for Phase 5 modification:**
- Replace the photo + caption render with a single meme image render:
  ```typescript
  <img src={`data:image/png;base64,${ratingStep.meme}`} alt={HEBREW_UI.photoAlt} />
  ```
- `ratingStep.meme` will be a base64-encoded PNG string from the protocol (replaces `caption` and `photoUrl`)
- Vote submission logic and error handling remain unchanged
- Add `@fontsource/heebo` import (for consistency, though rendering is server-provided)

---

### `client/src/screens/round/RoundEndPanel.tsx` (component, request-response)

**Current state:** Renders sorted entries with author name, caption text, and score.

**Analog:** `client/src/screens/round/RoundEndPanel.tsx` (existing)

**Current entry rendering** (lines 34-42):
```typescript
<li key={entry.authorId} className="round-end-entry">
  <p>{entry.authorName}</p>
  <p>{entry.caption}</p>
  <p className="round-end-score">
    {entry.score} {HEBREW_UI.roundResultsPointsSuffix}
  </p>
</li>
```

**Notes for Phase 5 modification:**
- Replace `<p>{entry.caption}</p>` with:
  ```typescript
  <img src={`data:image/png;base64,${entry.meme}`} alt={HEBREW_UI.photoAlt} className="meme-photo" />
  ```
- `entry.meme` will be a base64-encoded PNG string (replaces the `caption` field in `RoundEndEntry`)
- Keep author name and score rendering
- Keep sorting logic (by `entry.score`)
- Reuse `.meme-photo` CSS class from existing stylesheet

---

### `client/src/screens/round/GameEndPanel.tsx` (component, request-response)

**Current state:** Renders winner banner, scoreboard, and best-of-night entries with photo + caption per entry.

**Analog:** `client/src/screens/round/GameEndPanel.tsx` (existing)

**Current best-of-night entry rendering** (lines 57-64):
```typescript
<li key={`${entry.authorId}-${index}`} className="best-of-entry">
  <img className="meme-photo" src={entry.photoUrl} alt={HEBREW_UI.photoAlt} />
  <p>{entry.caption}</p>
  <p className="best-of-meta">
    {entry.authorName} — {entry.score} {HEBREW_UI.roundResultsPointsSuffix}
  </p>
</li>
```

**Notes for Phase 5 modification:**
- Replace the photo + caption with a single meme image:
  ```typescript
  <img className="meme-photo" src={`data:image/png;base64,${entry.meme}`} alt={HEBREW_UI.photoAlt} />
  ```
- Remove the now-redundant `<p>{entry.caption}</p>` line
- `entry.meme` replaces both `caption` and `photoUrl` in `BestOfEntry`
- Keep author name and score rendering
- Keep `.meme-photo` CSS class styling

---

### `shared/protocol.ts` (model, CRUD)

**Current state:** Defines `RatingStepView`, `RoundEndEntry`, and `BestOfEntry` types with `caption: string` and `photoUrl: string` fields.

**Analog:** `shared/protocol.ts` (existing)

**Current `RatingStepView` definition** (lines 50-60):
```typescript
export type RatingStepView = {
  index: number;
  total: number;
  caption: string;
  photoUrl: string;
  youAreAuthor: boolean;
  youMayRate: boolean;
  youHaveRated: boolean;
  ratedCount: number;
  eligibleCount: number;
};
```

**Current `RoundEndEntry` definition** (lines 68-77):
```typescript
export type RoundEndEntry = {
  authorId: string;
  authorName: string;
  caption: string;
  ratings: RatingValue[];
  eligibleAtClose: number;
  score: number;
};
```

**Current `BestOfEntry` definition** (lines 87-93):
```typescript
export type BestOfEntry = {
  authorId: string;
  authorName: string;
  caption: string;
  photoUrl: string;
  score: number;
};
```

**Notes for Phase 5 modification:**
- **`RatingStepView`**: Replace `caption: string` and `photoUrl: string` with `meme: string` (base64-encoded PNG)
- **`RoundEndEntry`**: Replace `caption: string` with `meme: string`
- **`BestOfEntry`**: Replace `caption: string` and `photoUrl: string` with `meme: string`
- All three types now carry a single immutable rasterized image instead of structured data

**Example new `RatingStepView`:**
```typescript
export type RatingStepView = {
  index: number;
  total: number;
  meme: string;  // base64-encoded PNG replacing caption + photoUrl
  youAreAuthor: boolean;
  youMayRate: boolean;
  youHaveRated: boolean;
  ratedCount: number;
  eligibleCount: number;
};
```

---

### `server/src/rooms/Room.ts` (service, request-response)

**Current state:** `submitCaption(playerId: string, text: string)` method validates and stores captions.

**Analog:** `server/src/rooms/Room.ts` - `submitCaption()` method (lines 429-443)

**Current `submitCaption` method**:
```typescript
submitCaption(playerId: string, text: string): SubmitCaptionOutcome {
  if (this.phase !== "WRITING") {
    return { ok: false, error: "WRONG_PHASE" };
  }
  if (text.length === 0) {
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  if (this.submissions.has(playerId)) {
    return { ok: false, error: "ALREADY_SUBMITTED" };
  }

  this.submissions.set(playerId, text);
  this.maybeCollapseWriting();
  return { ok: true };
}
```

**Notes for Phase 5 modification:**
- Signature: Change `text: string` parameter to `meme: string` (base64-encoded PNG)
- Validation pattern stays the same:
  1. Check phase is WRITING → `WRONG_PHASE`
  2. Check meme is non-empty → `CAPTION_REQUIRED` (size check: must be > 10KB and < 2MB)
  3. Check player hasn't already submitted → `ALREADY_SUBMITTED`
- Storage: `this.submissions.set(playerId, meme)` — store base64 string as-is
- Early-finish collapse: `this.maybeCollapseWriting()` call unchanged
- Return type unchanged: `SubmitCaptionOutcome`

**Example new validation:**
```typescript
submitCaption(playerId: string, meme: string): SubmitCaptionOutcome {
  if (this.phase !== "WRITING") {
    return { ok: false, error: "WRONG_PHASE" };
  }
  if (!meme || typeof meme !== 'string') {
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  
  // Size validation: base64 string length → binary size estimate
  const sizeKB = Math.ceil((meme.length * 3) / 4 / 1024);
  if (sizeKB < 10 || sizeKB > 2000) {
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  
  if (this.submissions.has(playerId)) {
    return { ok: false, error: "ALREADY_SUBMITTED" };
  }

  this.submissions.set(playerId, meme);
  this.maybeCollapseWriting();
  return { ok: true };
}
```

---

### `client/package.json` (config)

**Current state:** No font packages installed.

**Analog:** `client/package.json` (existing)

**Current dependencies** (lines 14-18):
```json
"dependencies": {
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "socket.io-client": "^4.8.3"
}
```

**Notes for Phase 5 modification:**
- Add to `dependencies`:
  ```json
  "@fontsource/heebo": "^4.x",
  "@fontsource/assistant": "^4.x"
```
- Both are already used by Google Fonts and maintained by the Fontsource project
- No other canvas libraries needed — use native Canvas 2D API

---

### `client/src/index.css` (config)

**Current state:** Mobile-first system with 16px base font, 44px tap targets, relative widths.

**Analog:** `client/src/index.css` (existing)

**Key mobile-first constraints** (lines 1-31):
```css
/* Mobile-first, right-to-left. Every screen in this app is read on a phone held
   in one hand, so the base styles target a narrow viewport and nothing here
   assumes a wide one. */

:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
  /* 16px is the floor for form fields: below it, iOS Safari zooms the page in
     when a field takes focus and the player has to pinch back out mid-game. */
  font-size: 16px;
  line-height: 1.5;
}

main {
  /* The padding is what stopped the Hebrew title and the field label from
     being clipped against the right edge of the screen. */
  padding: 1.25rem 1rem 2rem;
  max-width: 32rem;
  margin-inline: auto;
}
```

**Writing panel section** (lines 200-214):
```css
.writing-panel {
  margin: 1rem 0;
}

.writing-panel textarea {
  font: inherit;
  width: 100%;
  min-height: 4.5rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  resize: vertical;
}
```

**Notes for Phase 5 modification:**
- Canvas editor must fit within the existing `.writing-panel` container width (100% responsive)
- Use `max-width: 24rem` (matching `.meme-photo` max-width for consistency)
- Button/tap targets must remain at 44px minimum (2.75rem)
- No fixed pixel widths — all relative widths and padding
- Hebrew text styling: use `word-spacing` not `letter-spacing` (per existing convention)
- Canvas coordinate system: scale for high-DPI screens (2x pixel ratio on phones)

---

### `shared/messages.ts` (config)

**Current state:** Contains `HEBREW_ERRORS` and `HEBREW_UI` maps with all user-facing strings.

**Analog:** `shared/messages.ts` (existing)

**Existing HEBREW_UI structure** (lines 29-94):
```typescript
export const HEBREW_UI = {
  namePlaceholder: "איך קוראים לך?",
  joinButton: "הצטרפות",
  // ... more entries
  captionPlaceholder: "כתבו כיתוב מצחיק...",
  sendCaptionButton: "שליחה",
  // ... more entries
  bestOfNightHeading: "המצחיקים של הערב",
};
```

**Notes for Phase 5 modification:**
- Add new strings for the canvas editor UI (all in Hebrew):
  ```typescript
  // Canvas editor UI strings
  memeEditorInstructions: "...",      // Instructions for using the drag editor
  addCaptionBoxButton: "הוספת כיתוב", // "Add caption"
  deleteCaptionButton: "מחיקה",        // "Delete" (or long-press to delete)
  saveMemeButton: "שמור תמונה",        // "Save image"
  shareMemeButton: "שתף תמונה",        // "Share image"
  longPressInstructions: "...",        // Long-press fallback instructions for iOS
  ```
- Add new error codes (if needed):
  ```typescript
  MEME_REQUIRED: "צריך לכתוב כיתוב אחד לפחות כדי לשלוח",
  MEME_TOO_LARGE: "התמונה גדולה מדי — נסו לצמצם את הכיתובים",
  ```
- Keep existing strings, only add new ones

---

### `server/src/app.ts` (config)

**Current state:** Socket.IO server initialized with ping interval/timeout and connection state recovery.

**Analog:** `server/src/app.ts` (existing lines 46-50)

**Current Socket.IO configuration**:
```typescript
const io = new SocketIOServer(httpServer, {
  pingInterval: PING_INTERVAL_MS,
  pingTimeout: PING_TIMEOUT_MS,
  connectionStateRecovery: {},
});
```

**Notes for Phase 5 modification:**
- Add `maxHttpBufferSize` to accommodate base64-encoded PNG messages (~250KB per meme, max 1MB uncompressed)
- Updated configuration:
  ```typescript
  const io = new SocketIOServer(httpServer, {
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    connectionStateRecovery: {},
    maxHttpBufferSize: 5e6, // 5MB — allows base64 PNGs up to ~4MB compressed
  });
  ```
- This must match client-side config (if client library allows configuration)
- Documented in RESEARCH.md as non-risky (one-line change)

---

## Shared Patterns

### Socket.Once Error/State Round-Trip Pattern
**Source:** `client/src/screens/round/WritingPanel.tsx` (lines 53-75) and `RatingPanel.tsx` (lines 36-60)
**Apply to:** All new canvas editor and meme submission flows

```typescript
function handleEvent(e: React.FormEvent) {
  e.preventDefault();
  setError(undefined);

  const socket = getSocket();
  const onError = (err: ProtocolError) => {
    setError(HEBREW_ERRORS[err.code]);
    cleanup();
  };
  const onState = () => {
    // Success — wait for next snapshot; no optimistic mutation
    cleanup();
  };
  function cleanup() {
    socket.off(SERVER_EVENTS.error, onError);
    socket.off(SERVER_EVENTS.state, onState);
  }

  socket.once(SERVER_EVENTS.error, onError);
  socket.once(SERVER_EVENTS.state, onState);
  socket.emit(CLIENT_EVENTS.submitCaption, { /* payload */ });
}
```

### Server Submission Validation Pattern
**Source:** `server/src/rooms/Room.ts` - `submitCaption()` method (lines 429-443)
**Apply to:** Meme base64 validation

```typescript
method(playerId: string, data: unknown): SubmitOutcome {
  // 1. Phase check
  if (this.phase !== "WRITING") {
    return { ok: false, error: "WRONG_PHASE" };
  }
  
  // 2. Content validation
  if (!isValid(data)) {
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  
  // 3. Duplicate check
  if (this.submissions.has(playerId)) {
    return { ok: false, error: "ALREADY_SUBMITTED" };
  }

  // 4. Store and maybe collapse
  this.submissions.set(playerId, data);
  this.maybeCollapseWriting();
  return { ok: true };
}
```

### Grapheme-Based Text Validation
**Source:** `client/src/screens/round/WritingPanel.tsx` (lines 21-37)
**Apply to:** Per-caption-box character limits in the canvas editor

```typescript
const segmenter = new Intl.Segmenter("he", { granularity: "grapheme" });

function toGraphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((s) => s.segment);
}

function graphemesRemaining(value: string): number {
  return MAX_GRAPHEMES - toGraphemes(value).length;
}

function clampForInput(value: string): string {
  const graphemes = toGraphemes(value);
  if (graphemes.length <= MAX_GRAPHEMES) return value;
  return graphemes.slice(0, MAX_GRAPHEMES).join("");
}
```

### Canvas Meme Rendering Pattern (from RESEARCH.md)
**Source:** Phase 5 RESEARCH.md (lines 647-710)
**Apply to:** WritingPanel canvas composition before submit and RatingPanel/RoundEndPanel/GameEndPanel meme display

```typescript
async function composeAndRasterize(
  photoUrl: string,
  captions: Array<{ id: string; text: string; x: number; y: number }>
): Promise<string> {
  // Wait for fonts to load
  await document.fonts.ready;

  const canvas = canvasRef.current!;
  const ctx = canvas.getContext('2d')!;

  // Load and draw the photo
  const photo = new Image();
  photo.src = photoUrl;
  await new Promise((resolve) => {
    photo.onload = resolve;
  });
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

  // Draw each caption box
  for (const caption of captions) {
    if (!caption.text.trim()) continue;

    // Semi-transparent backing
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(caption.x, caption.y, BOX_WIDTH, BOX_HEIGHT);

    // RTL text rendering — CRITICAL
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Heebo';
    ctx.direction = 'rtl'; // Enables Hebrew bidi + glyph shaping
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    const lines = caption.text.split('\n');
    let y = caption.y + 5;
    for (const line of lines) {
      ctx.fillText(line, caption.x + BOX_WIDTH - 5, y);
      y += 20;
    }
  }

  // Rasterize to blob, then base64
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob failed'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    }, 'image/png', 0.9);
  });
}
```

### Pointer Events Drag Pattern (from RESEARCH.md)
**Source:** Phase 5 RESEARCH.md (lines 712-771)
**Apply to:** WritingPanel caption box dragging

```typescript
const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);
const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>, boxId: string) {
  const box = boxes.find((b) => b.id === boxId);
  if (!box) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;

  setDragOffset({
    x: pointerX - box.x,
    y: pointerY - box.y,
  });

  setDraggingBoxId(boxId);
  (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
  if (!draggingBoxId) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;

  const newX = Math.max(0, Math.min(pointerX - dragOffset.x, rect.width - 200));
  const newY = Math.max(0, Math.min(pointerY - dragOffset.y, rect.height - 80));

  setBoxes((prev) =>
    prev.map((b) => (b.id === draggingBoxId ? { ...b, x: newX, y: newY } : b))
  );
}

function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
  (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  setDraggingBoxId(null);
}
```

### Navigator.share with Fallback (from RESEARCH.md)
**Source:** Phase 5 RESEARCH.md (lines 773-809)
**Apply to:** Download/share button at end of WritingPanel, GameEndPanel best-of-night

```typescript
async function handleSaveOrShare(blob: Blob) {
  const file = new File([blob], 'tamir-meme.png', { type: 'image/png' });

  // Try native share first
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Tamir Meme',
        text: 'My funny meme from the party',
      });
      return; // Success
    } catch (e) {
      // User cancelled share, fall through to fallback
    }
  }

  // Fallback: show full-screen image + instructions
  const url = URL.createObjectURL(blob);
  setFallbackImageUrl(url);
  setShowFallback(true);
}

function SaveFallback({ imageUrl, onDone }: Props) {
  return (
    <dialog open>
      <img src={imageUrl} style={{ maxWidth: '100%' }} alt="Your meme" />
      <p>{HEBREW_UI.longPressInstructions}</p>
      <button onClick={onDone}>{HEBREW_UI.done}</button>
    </dialog>
  );
}
```

---

## No Analog Found

All files being created or modified have clear existing analogs in the codebase. No completely new patterns are required beyond what is documented in RESEARCH.md and this PATTERNS.md.

---

## Metadata

**Analog search scope:** `/home/user/makeitmemeTamir/client/src/`, `/home/user/makeitmemeTamir/server/src/`, `/home/user/makeitmemeTamir/shared/`

**Files scanned:** 13 React components, 2 protocol/config files, 1 server Room file, 1 CSS file, 1 package.json, 1 messages file

**Pattern extraction date:** 2026-09-07

**Key patterns identified:**
1. **Socket.once error/state round-trip:** All socket submissions use this pattern; new meme submit will follow
2. **Server submission validation:** Phase check → content validation → duplicate check → storage → collapse
3. **Grapheme-based text clamping:** Reusable for per-caption character limits
4. **Canvas 2D with `ctx.direction='rtl'`:** Native browser API, no external library needed
5. **Pointer events + setPointerCapture:** Unified touch/mouse drag API
6. **Font loading with `document.fonts.ready`:** Wait before any canvas text rendering
7. **base64 meme transmission:** Replaces structured data; same socket patterns apply
8. **Meme image rendering:** Replace photo + caption with `<img src={data:image/png;base64,...} />`

---

*Phase: 5 - Hebrew RTL Meme Compositor & Souvenir*
*Pattern map generated: 2026-09-07*
*Ready for planning phase*
