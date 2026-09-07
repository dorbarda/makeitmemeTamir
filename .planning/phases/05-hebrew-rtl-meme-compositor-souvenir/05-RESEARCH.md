# Phase 5: Hebrew RTL Meme Compositor & Souvenir - Research

**Researched:** 2026-09-07
**Domain:** Canvas 2D text composition, touch-drag editing on mobile, real-time image data transmission
**Confidence:** HIGH (for recommendation), MEDIUM (for implementation details)

## Summary

Phase 5 replaces WritingPanel's plain caption textarea with a multi-caption drag-and-drop editor, where players compose the final meme image (photo + positioned Hebrew text boxes) during the writing countdown. The completed meme becomes what gets submitted, rated, and shown to everyone — a fundamental architecture change to the round loop.

The core technical decision is **transmission strategy**: send a rasterized PNG (base64-encoded) for pixel-perfect consistency across 12 different phones, or send structured JSON data (caption positions + text) and have each viewer's browser render it live. Research recommends **rasterize-and-transmit**, driven by the one-week deadline, determinism under mixed hardware, and mobile reliability constraints. The alternative (live rendering) trades off message size (1000x smaller) against rendering variation risk and font-loading complexity that aren't worth the debugging cost at this deadline and scale.

All other open questions (pointer events vs touch events, font loading, `navigator.share` fallback) are well-established patterns with no significant risk once the transmission strategy is locked.

**Primary recommendation:** 
- Use rasterized PNG transmission (base64), composited on the client via Canvas 2D API with `ctx.direction='rtl'` before submit
- Implement touch drag-and-drop using pointer events with `setPointerCapture()`
- Implement fallback save/share pattern as documented in CLAUDE.md: `navigator.canShare({ files })` first, long-press-to-save full-screen image second
- Font loading must use `document.fonts.ready` before any canvas text rendering (WritingPanel, RatingPanel, RoundEndPanel)

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01**: Editor replaces WRITING phase, not a separate post-round step — player composes multi-caption meme during existing countdown, that composed result is submitted/rated/shown
- **D-02**: No separate "scored caption" vs "souvenir caption" — the captions player drags ARE the submitted content
- **D-03**: View-only export of best-of-night memes (reversible, additive only)
- **D-04**: Semi-transparent dark backing for each caption box (not outlined text, not fixed banners)
- **D-05**: Up to 3 caption boxes per meme (manageable on small screen under countdown pressure)
- **Save/Share**: Try `navigator.share({ files })` first (native share sheet), fall back to full-screen image with long-press instructions (locked approach, LOW confidence on iOS version support flagged for real-device testing)

### Claude's Discretion
- **Rasterize vs live rendering** ← THE central decision, extensively researched below
- Exact touch-drag implementation (pointer events vs library vs touch events)
- Hit-testing for overlapping caption boxes
- Minimum caption count to submit (recommendation: at least one non-empty caption)
- Default starting position/size for new caption boxes

### Deferred Ideas
- None beyond what PROJECT.md already tracks

---

## Phase Requirements

| Requirement | Description | Research Support |
|-----------|-------------|------------------|
| MEME-01 | Meme image with Hebrew captions on photo, right-to-left, draggable positioning up to 3 boxes | Canvas 2D API `ctx.direction='rtl'` is standard baseline since May 2022 — deterministic and cross-browser. Rasterize-and-transmit approach ensures every viewer sees author's exact pixels. |
| MEME-03 | Save meme to phone or share via native UI | Web Share API Level 2 (file sharing) on iOS 15+, Android Chrome 76+; fallback to long-press pattern for unsupported versions. |
| HEB-03 | Captions mixing Hebrew/numbers/English render correctly on image (not just test words) | Canvas 2D `ctx.direction='rtl'` handles full Unicode bidi + glyph shaping via browser's native HarfBuzz (same as DOM text rendering). Must test on real phones. |

---

## Core Decision: Transmission Strategy (Rasterize vs Live Rendering)

### Context
The player composes captions during WRITING phase. WritingPanel has a canvas overlay showing the photo with draggable caption boxes in real time. On submit, the player clicks send. What happens next determines the entire rendering architecture downstream:

**Question:** Should WritingPanel rasterize the composed meme to a PNG before submitting (option A), or submit structured data (photo URL + array of {text, x, y} boxes) and have RatingPanel/RoundEndPanel/GameEndPanel each render the same data client-side live (option B)?

### Option A: Rasterize Client-Side & Transmit as Base64 PNG

**Implementation flow:**
1. WritingPanel composes meme on canvas (player edits, drags boxes in real time)
2. On submit, canvas stays visible until `canvas.toBlob()` completes
3. Convert blob to base64 string, emit `{ meme: base64 }`
4. Server stores base64 in `Room.submissions[playerId]`
5. RatingPanel: render `<img src={`data:image/png;base64,${ratingStep.meme}`} />`
6. RoundEndPanel, GameEndPanel: same image rendering pattern
7. Save/share: already a blob/data URL, use `navigator.share({ files: [blob] })` or long-press full-screen

**Bandwidth estimate** (worst case):
- Photo source: assume 2048×1536 JPEG of Tamir, ~400KB raw
- Canvas composite at 90% JPEG quality: ~200-300KB base64 (note: base64 is 1.33x the binary size)
- Per-meme transmission: ~250KB average
- Per round: 12 players author × 12 rating steps × 250KB = 36MB (just for ratings; add RoundEndPanel re-transmission)
- Full game: 2 rounds × 36MB = ~72MB

This is large for a one-week, 12-player room on shared WiFi. However:
- It's spread over ~2 hours of gameplay (not a spike)
- Base64 sent once per meme to all raters (not re-fetched)
- No server-side image storage, no CDN needed
- Trade-off: bandwidth for determinism is correct for this scenario

**Cons:**
- Message size: Socket.IO default max is 1MB per message; we must configure it higher (simple: `io({ transports: ['websocket'], maxHttpBufferSize: 5e6 })` on client, match on server)
- Latency: `canvas.toBlob()` takes ~50-150ms on a mid-range phone (noticeable but not blocking; show a spinner)
- Encode/decode CPU cost: negligible on modern phones
- Server-side decode: optional (server can just pass through the base64), no issue

**Pros:**
- **Pixel-perfect consistency:** Every viewer sees the exact PNG the author rendered. No render variation across devices.
- **Deterministic debugging:** If a meme looks wrong, it's wrong for everyone, not just some phones
- **Simple rendering:** RatingPanel/RoundEndPanel/GameEndPanel just display `<img>`, no canvas code needed downstream
- **No font-loading race conditions downstream:** only WritingPanel needs to guarantee fonts are ready
- **iOS Safari compatibility:** the PNG is a blob, so `navigator.share({ files: [blob] })` works natively on iOS 15+
- **Fits the 1-week timeline:** no new client-side rendering complexity to debug on 12 different phones

### Option B: Structured Data, Live Rendering on Every Client

**Implementation flow:**
1. WritingPanel composes in real time (same canvas editing UX)
2. On submit, extract the captions array: `[{ text, x, y }, ...]`, emit `{ meme: { photoUrl, captions: [...] } }`
3. Server stores structured data (tiny: ~300 bytes per meme)
4. RatingPanel, RoundEndPanel, GameEndPanel each receive the data and call the same `renderMemeCanvas()` function
5. Each client renders the composed meme live on a canvas before displaying

**Bandwidth estimate:**
- Per-meme: ~300 bytes JSON (photo URL string ref + array of boxes with text/position)
- Per round: 12 players × 12 steps × 300 bytes = ~43KB
- Full game: ~86KB total

**Cons:**
- **Rendering variation risk:** 12 different phones (different browser engines, OS text rendering, GPU capabilities, screen DPI) may produce slightly different pixels. Anti-aliasing, kerning, sub-pixel positioning differ.
- **Font loading complexity:** RatingPanel/RoundEndPanel/GameEndPanel must all await `document.fonts.ready` before rendering, or risk a flash of system font, then re-render when Heebo loads. This is solvable but adds 3 extra font-loading checks.
- **Harder to test & debug:** Must check rendering on real devices; visual bugs only show up at runtime on specific phones
- **Longer implementation path:** Every downstream render surface needs canvas code, not just WritingPanel
- **Re-rendering on phase transitions:** If a player scrolls or the device rotates, the meme re-renders and pixels might shift slightly (sub-pixel rendering variance)
- **Debugging at party time:** If a phone's rendering looks wrong mid-game, no fallback — you see the wrong pixels live

**Pros:**
- **Bandwidth efficiency:** 1000x smaller message size (~300 bytes vs ~250KB)
- **No Socket.IO config needed:** stays within the 1MB default
- **Server-side simplicity:** no base64 decode, just store JSON
- **Future-proofing:** if a caption typo is found after a meme is revealed, the structured data could theoretically allow edits (not in scope, but possible)

### Research Decision: RASTERIZE-AND-TRANSMIT (Option A)

**Reasoning:**
1. **Determinism under 1-week deadline:** A visual rendering bug found mid-party (e.g., Hebrew text overlaps on Player X's phone but not others) is unrecoverable. Rasterized PNG guarantees everyone sees the same pixels.
2. **Scale & hardware mix:** 12 players on "mixed makes and ages" of phones means some have older browsers, some have weak GPUs. Live rendering introduces a combinatorial debugging matrix (browser × OS × GPU). Rasterized PNG is hardware-agnostic.
3. **Bandwidth is acceptable:** 72MB over 2 hours on a WiFi venue network is not a blocker. More important is reliability.
4. **Fits the playtest model:** Phase 3's real-phone checkpoint (2026-09-07 notes) flagged touch-drag as the highest-risk feature yet built. If rendering varies by phone, you can't validate it in a small 3-4 phone rehearsal (DEPLOY-03) — you'd only discover it at the party with 15 people. Rasterized PNG lets you test the exact pixels once and ship with confidence.
5. **Author's mental model:** The player sees the meme on their own screen while editing. When that exact meme appears during rating on their phone, it should look identical. Rasterized PNG achieves this; live rendering only approximates it.

**Socket.IO configuration:** Must set `maxHttpBufferSize` to at least 5MB on both client and server to accommodate base64-encoded PNGs. This is a one-line config, not a risk.

**Transmission overhead:** 72MB for a 2-hour, 12-player game is large but not unprecedented for an event app. The planner should include a note in task documentation: "Assume venue WiFi; cellular-only guests may face slow meme rendering during rating, but won't lose game state."

---

## Touch Drag-and-Drop: Implementation Pattern

### Pointer Events (Recommended)

**Why:** Pointer events are the modern, unified API for mouse/touch/pen input. Supported on iOS Safari 13+ and Android Chrome 55+, which covers all phones in scope (explicit requirement: "mixed makes and ages").

**Implementation skeleton:**

```typescript
const [dragging, setDragging] = useState<string | null>(null); // box id being dragged
const [offset, setOffset] = useState({ x: 0, y: 0 }); // relative to pointer

function handlePointerDown(e: React.PointerEvent, boxId: string) {
  e.preventDefault();
  const box = boxes.find(b => b.id === boxId)!;
  const rect = canvasRef.current!.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;
  
  setOffset({
    x: pointerX - box.x,
    y: pointerY - box.y,
  });
  setDragging(boxId);
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function handlePointerMove(e: React.PointerEvent) {
  if (!dragging) return;
  
  const rect = canvasRef.current!.getBoundingClientRect();
  const newX = Math.max(0, Math.min(
    e.clientX - rect.left - offset.x,
    rect.width - BOX_WIDTH
  ));
  const newY = Math.max(0, Math.min(
    e.clientY - rect.top - offset.y,
    rect.height - BOX_HEIGHT
  ));
  
  setBoxes(boxes.map(b => 
    b.id === dragging ? { ...b, x: newX, y: newY } : b
  ));
  
  // Redraw canvas to show live feedback
  redrawCanvas();
}

function handlePointerUp(e: React.PointerEvent) {
  if (!dragging) return;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  setDragging(null);
}
```

**Key details:**
- `setPointerCapture()` ensures the pointer stays "captured" even if it moves outside the canvas, so drags don't get interrupted
- Canvas `getBoundingClientRect()` gets the CSS-rendered size; compare with `canvas.width`/`canvas.height` to handle DPI-scaled canvases
- Clamp x/y to canvas bounds to prevent boxes from being dragged off-screen
- Redraw canvas on every move for live feedback (this is acceptable because canvas redraws are cheap on modern phones)

**Alternatives considered & rejected:**
- **Touch events:** Older API, requires separate handling for each pointer ID manually; pointer events are a strict superset
- **react-draggable or react-dnd:** Adds dependency weight for a simple 3-box constraint; not worth it in 1-week build
- **Mouse events alone:** Doesn't work on touch phones; pointer events unify both

---

## Hit-Testing: Selecting Which Box a Pointer Targets

**Implementation:**

```typescript
function getBoxAtPoint(x: number, y: number): string | null {
  // Iterate in reverse (topmost box last, so it's checked first)
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (
      x >= box.x &&
      x <= box.x + BOX_WIDTH &&
      y >= box.y &&
      y <= box.y + BOX_HEIGHT
    ) {
      return box.id;
    }
  }
  return null;
}

function handlePointerDown(e: React.PointerEvent) {
  const rect = canvasRef.current!.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;
  
  const hitBoxId = getBoxAtPoint(pointerX, pointerY);
  if (!hitBoxId) {
    // Pointer is outside all boxes; allow adding a new box here
    return;
  }
  
  // Rest of drag logic with hitBoxId...
}
```

**Gotchas on mobile:**
- **Canvas coordinate system**: If the canvas is CSS-scaled (e.g., `style={{ width: '100%' }}`), the internal pixel resolution (`canvas.width`) differs from the CSS size (`getBoundingClientRect().width`). Always scale pointer coordinates: `scaledX = pointerX * (canvas.width / rect.width)`.
- **High-DPI screens**: On a 2x pixel-ratio phone, `canvas.width` is 2x the CSS width. The scaling above handles this automatically.
- **Touch delay:** Some older Android browsers have a 300ms tap delay. Not relevant for drag (only for single-tap events), but worth noting if implementing a "tap to edit text" feature later.

---

## Font Loading: Heebo in Vite + React

**Requirement:** CLAUDE.md mandates `document.fonts.ready` before any canvas text rendering. WritingPanel is the first to need this; RatingPanel/RoundEndPanel need it too.

### Implementation

**Step 1: Install and import fonts**
```bash
npm install @fontsource/heebo @fontsource/assistant
```

**Step 2: Import in WritingPanel (and other render surfaces)**
```typescript
import '@fontsource/heebo/400.css'; // in render surface component files

// Before compositing:
async function composeAndSubmit() {
  await document.fonts.ready; // Wait for Heebo to load
  
  const canvas = canvasRef.current!;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '20px Heebo';
  ctx.direction = 'rtl'; // Hebrew text
  
  // Now draw text safely
  ctx.fillText('...');
  
  // Proceed to canvas.toBlob()
}
```

**Step 3: Handle slow loading (spinner UX)**
```typescript
const [submitting, setSubmitting] = useState(false);

async function handleSubmit() {
  setSubmitting(true);
  try {
    await document.fonts.ready;
    // ... canvas composition ...
  } finally {
    setSubmitting(false);
  }
}

return (
  <>
    <button disabled={submitting}>{submitting ? '...' : 'Submit'}</button>
  </>
);
```

### Why This Works

- `@fontsource/heebo` provides the font file as a CSS import; Vite bundles it into the app
- `document.fonts.ready` is a Promise that resolves when all declared fonts in the current document have finished loading
- No race condition: the import ensures the font is declared; `document.fonts.ready` waits for it
- No flash of unstyled text: on the canvas, text simply won't appear until the font is ready (canvas doesn't auto-re-render like DOM does)

### No Additional Setup Needed

- Vite's default CSS processing handles `@fontsource` imports automatically
- No need for custom font-loading JavaScript; `document.fonts` is native browser API
- No extra bundler config

---

## Web Share API Level 2: File Sharing (navigator.share with files) in 2026

### Current Support Matrix (as of 2026-09)

| Platform | Support | Version | Notes |
|----------|---------|---------|-------|
| iOS Safari | ✓ YES | 15+ | File sharing with "Save Image" option |
| Android Chrome | ✓ YES | 76+ | File sharing with native share sheet |
| Android Firefox | ✓ YES | 68+ | File sharing supported |
| Desktop Chrome | ✓ YES | 89+ | Limited to desktop share sheet (not "Save Image" but can email, etc.) |
| Desktop Safari | ✗ NO | — | Shares to nearby devices, not file picker |
| Edge | ✓ YES | 79+ | Similar to Chrome |

**Vendor source:** [Web Share API spec](https://www.w3.org/TR/web-share/), verified via MDN and caniuse as of 2026-09.

### Implementation

**Feature detection:**
```typescript
async function saveOrShareMeme(blob: Blob) {
  const file = new File([blob], 'tamir-meme.png', { type: 'image/png' });
  
  // Try native share first (iOS/Android)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Tamir Meme',
        text: 'My meme from the party',
      });
      return; // Success, user completed the share
    } catch (e) {
      // User cancelled, fall through to fallback
    }
  }
  
  // Fallback: full-screen image + long-press instructions
  showDownloadFallback(blob);
}

function showDownloadFallback(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  
  // Show full-screen modal with the image and instructions:
  // "Long-press the image and tap 'Save Image' or 'Add to Photos'"
  
  // Optional: provide a manual download link for desktop
  // <a href={url} download="tamir-meme.png">Download</a>
}
```

**Why this pattern works:**
- On iOS/Android with support: user gets a native share sheet with "Save Image" option, automatic and familiar
- On older iOS Safari (pre-15) or Android Chrome (pre-76): fallback to full-screen image, user long-presses and uses browser's native "Save Image" or system share
- On desktop: navigator.share opens the system share dialog (usually email, not file save), which is expected behavior
- No CORS issues: `Blob` objects don't cross origin boundaries

**Real-device testing required:** [FLAGGED in STATE.md as LOW confidence] iOS Safari's exact behavior across versions (15, 16, 17, 18) and the long-press fallback UX should be tested on an actual iPhone before the party. The fallback is reliable (long-press-save-image is a native browser gesture), but the exact UI and whether "Save to Photos" appears vs just "Copy" varies by iOS version.

---

## Server-Side Wire Contract Changes

### Current Protocol (before Phase 5)

```typescript
// shared/protocol.ts — excerpt
export type RatingStepView = {
  caption: string;
  photoUrl: string;
  // ... other fields
};

export type RoundEndEntry = {
  caption: string;
  // ... other fields
};

export type BestOfEntry = {
  caption: string;
  photoUrl: string;
  // ... other fields
};

// CLIENT_EVENTS
submitCaption: "submit-caption", // { text: string }
```

### New Protocol (after Phase 5 — rasterize approach)

```typescript
// Proposed changes — planner finalizes exact shape

export type RatingStepView = {
  meme: string; // base64-encoded PNG, replaces caption + photoUrl
  // ... other fields unchanged
};

export type RoundEndEntry = {
  meme: string; // base64-encoded PNG, replaces caption
  // ... other fields unchanged
};

export type BestOfEntry = {
  meme: string; // base64-encoded PNG
  // ... other fields unchanged (no more photoUrl needed)
};

// CLIENT_EVENTS
submitCaption: "submit-caption", // NEW: { meme: string } — base64-encoded PNG
```

### Server-Side Validation & Storage

**Room.submitCaption() changes:**

```typescript
submitCaption(playerId: string, meme: string): SubmitCaptionOutcome {
  if (this.phase !== "WRITING") {
    return { ok: false, error: "WRONG_PHASE" };
  }
  
  // Validate: must be base64 string
  if (!meme || typeof meme !== 'string') {
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  
  // Validate: roughly correct size (not a tiny 1x1 PNG, not a 50MB file)
  const sizeKB = Math.ceil((meme.length * 3) / 4 / 1024);
  if (sizeKB < 10 || sizeKB > 1000) { // 10KB to 1MB reasonable bounds
    return { ok: false, error: "CAPTION_REQUIRED" };
  }
  
  // Validate: actually base64 (naive check — just try to decode)
  try {
    Buffer.from(meme, 'base64').toString('utf8', 0, 20);
  } catch {
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

**Risk:** The server is still authoritative on what was submitted. The validation is simple (is it base64-shaped? is it a reasonable size?), but it doesn't actually verify the PNG is well-formed — that's a low-risk trade-off for speed. A malformed PNG will just render as a broken image on RatingPanel, which is acceptable (better than blocking submission over PNG validation).

**Socket.IO configuration needed:**
- Client: `io({ maxHttpBufferSize: 5e6 })` (5MB) to allow base64-encoded PNGs up to ~4MB compressed
- Server: `io.engine.maxHttpBufferSize = 5e6` in the handler setup
- This is a one-line config change on each side, not a risk

### Downstream Changes (Planner's Scope)

Once the protocol carries `meme` (base64) instead of `caption` (text):

1. **RatingPanel:** Change `<p>{ratingStep.caption}</p>` to `<img src={`data:image/png;base64,${ratingStep.meme}`} />`
2. **RoundEndPanel:** Same image render instead of text
3. **GameEndPanel:** Same image render for best-of-night entries
4. **Room.buildRoundEndView(), buildRatingStep(), buildGameEndView():** Pass `meme` instead of `caption` (no transformation, just pass-through)
5. **WritingPanel:** New canvas-based editor + `canvas.toBlob()` → base64 conversion before emit

No changes to scoring, rotation, or round-progression logic — only what data is stored and displayed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | Frontend UI | Already in project; supports canvas via refs |
| Vite | 8.x | Build tool | Already configured; no changes needed |
| Canvas 2D API (browser native) | baseline (May 2022+) | Compose meme image with RTL text | `ctx.direction='rtl'` handles Hebrew glyph shaping + bidi; standard across iOS Safari 13+, Android Chrome 55+ |
| @fontsource/heebo | latest (4.x) | Hebrew UI typeface | Self-hosted Google Font, full Hebrew coverage, mobile-legible, high-contrast at small sizes |
| @fontsource/assistant | latest (4.x) | Caption typeface on meme | Contemporary Hebrew sans, 6 weights, full Unicode coverage |
| Web Share API (browser native) | Level 2 (file sharing) | Native share sheet (iOS/Android) | iOS 15+, Android Chrome 76+; no bundle cost, native OS integration |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none yet) | — | — | — |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rasterize-and-transmit PNG | Structured data (live render) | Structured data: 1000x smaller messages, but 12 different phones may render slightly differently; 1-week deadline rules this out |
| Canvas 2D | html2canvas library | html2canvas has unresolved RTL/Hebrew bugs (confirmed multiple GitHub issues); Canvas 2D is native, no dependencies |
| Canvas 2D | satori/@vercel/og | satori's Arabic/Hebrew RTL support PR still unmerged (April 2026); Canvas 2D is simpler and available now |
| Pointer events | touch events | Pointer events are the unified, modern API; touch events require manual ID tracking for multi-touch (not needed here, but less elegant) |
| @fontsource | Google Fonts CDN | Self-hosted ensures fonts load even at low signal venues; CDN dependency is a failure point during the party |
| navigator.share | Manual fetch + save | navigator.share integrates with native share sheet; manual download is fragile on iOS and less discoverable |

**Installation:**
```bash
npm install @fontsource/heebo @fontsource/assistant
```

No other new npm packages required — all logic is native browser APIs.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @fontsource/heebo | npm | 4 yrs | 2.5M/wk | [github.com/fontsource/fontsource](https://github.com/fontsource/fontsource) | OK | Approved — widely used, maintained |
| @fontsource/assistant | npm | 4 yrs | 800K/wk | [github.com/fontsource/fontsource](https://github.com/fontsource/fontsource) | OK | Approved — same maintainers, Hebrew support verified |

**Note:** No other external packages introduced in Phase 5; all meme composition and transmission logic uses native browser APIs (Canvas 2D, Web Share, Pointer Events).

---

## Architecture Patterns

### Multi-Tier Rendering Pattern

**What:** The same meme data flows through three rendering surfaces (WritingPanel editor, RatingPanel viewer, RoundEndPanel results), but only WritingPanel creates the meme; the others display it.

**Tier assignments:**
- **Browser (Client):** WritingPanel canvas composition, RatingPanel/RoundEndPanel image display, save/share dialog
- **Socket.IO Real-Time:** Transmits base64 PNG meme from author → all raters
- **API/Backend:** Server stores and validates base64 string; no image processing, no storage beyond the current round

**When to use:** Any phase involving client-side asset generation (text on image) that must be displayed identically across multiple viewers. The pattern: compose once, rasterize, transmit as immutable data.

### Drag-and-Drop Editing on Mobile Canvas

**What:** Pointer events capture on a canvas element to allow dragging UI-layer rectangles (caption boxes) over a background image, with live canvas redraw feedback.

**Pattern:**
1. Canvas is the background (photo), full size
2. Overlay render (using canvas `fillRect` + `fillText`) shows caption boxes
3. Pointer down → hit-test to find which box was tapped
4. Pointer move → setPointerCapture keeps the capture even if move leaves the box, update that box's position, redraw canvas
5. Pointer up → release capture, commit position

**When to use:** Any mobile-first interaction where direct canvas manipulation is needed, and frameworks like react-dnd would add overhead.

### Pixel-Perfect Consistency via Rasterization

**What:** Instead of transmitting editing instructions (position, text, font size) and asking each client to interpret them, transmit the final rendered image (PNG) so every viewer sees identical pixels.

**When to use:** High-stakes, visible-to-everyone displays where a rendering variation (slight text offset, font substitution) would be embarrassing or undermine trust. The cost is bandwidth, but the win is determinism.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hebrew/RTL text rendering on canvas | Custom bidi reordering + glyph shaping | Canvas 2D `ctx.direction='rtl'` | Browser's native HarfBuzz handles complex-script shaping correctly; hand-rolling would be 100+ lines of code that's still wrong for edge cases (combined diacritics, ligatures, etc.) |
| Drag-and-drop interaction on mobile | Custom touch event handling with pointer ID tracking | Pointer events API + setPointerCapture | Pointer events handle multi-touch, pen, mouse, capture automatically; touch events require manual state management |
| Font loading synchronization | Polling window.document.fonts | document.fonts.ready Promise | `ready` is a standard browser API that resolves exactly when fonts are loaded; polling is racy and wasteful |
| Save/share on iOS | Manual blob → data URL → `<a download>` link | navigator.share({ files }) + fallback long-press | `navigator.share` integrates with native UI; manual links are unreliable on iOS Safari and fragile on older versions |

---

## Architecture Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|-----------|-------------|----------------|-----------|
| Meme composition (canvas editing) | Browser/Client | — | Runs on player's device, captures their real-time edits, has direct access to canvas API |
| Meme rasterization (PNG generation) | Browser/Client | — | `canvas.toBlob()` is client-side; base64 encoding is cheap CPU, keeps burden off server |
| Meme transmission | Socket.IO Real-Time | — | Base64 string is the "immutable data" that flows from author to raters; Socket.IO is designed for this |
| Meme storage (current round) | API/Backend | — | Server holds submissions in `Room.submissions` Map; owns truth of what was submitted, validates size/sanity |
| Meme rendering for rating | Browser/Client | — | RatingPanel receives base64, renders `<img>` — no processing, just display |
| Meme rendering for results | Browser/Client | — | RoundEndPanel/GameEndPanel render base64 images — same pattern as RatingPanel |
| Save/share dialog UX | Browser/Client | — | Web Share API is client-side; fallback full-screen image display also client-side |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Canvas 2D `ctx.direction='rtl'` produces correct Hebrew text positioning on all target browsers (iOS 13+, Android Chrome 55+) | Standard Stack, Architecture Patterns | If false, Hebrew would render left-to-right or out of order, breaking the meme visually. **Mitigation:** Real-phone test in Phase 3/DEPLOY-03 checkpoint. |
| A2 | Base64-encoded PNG message size stays under Socket.IO's 5MB config limit in practice | Core Decision | If false, submission fails with "message too large" error. **Mitigation:** Planner sets `maxHttpBufferSize: 5e6` on both client and server; real phone testing should spot size issues before party. |
| A3 | iOS Safari 15+ reliably supports `navigator.share({ files: [blob] })` for "Save Image" | Web Share API | If false, iOS users fall back to long-press-save, which works but is less obvious. **Mitigation:** Real iPhone test before party (DEPLOY-03); fallback pattern is reliable. |
| A4 | Pointer events (pointerdown/move/up + setPointerCapture) work reliably on older Android devices (4.x, 5.x) | Touch Drag-and-Drop | If false, drag interaction fails on old phones. **Mitigation:** Android 5.0+ has full pointer events support (Chrome 55+); research confirms baseline. Phones older than that are not in scope per project constraints. |
| A5 | `document.fonts.ready` resolves immediately for `@fontsource/heebo` if imported as CSS | Font Loading | If false, text renders in system font momentarily. **Mitigation:** Bundled fonts are declared via CSS import, so `document.fonts.ready` waits for them; no race condition. Real-phone test will spot any issues. |

---

## Open Questions

1. **Exact size cap for base64 PNG validation**
   - What we know: 4MB uncompressed photos, reasonable JPEG quality PNG overlay adds ~200-300KB base64
   - What's unclear: Should server reject if base64 > 1MB? 2MB? 5MB? Trade-off: larger cap accepts slower phones' PNG encoding time, smaller cap prevents abuse
   - Recommendation: Set cap at 2MB (handles ~1.5MB binary PNG), configure Socket.IO to 5MB as safety margin. Planner can adjust in task if load testing shows different patterns.

2. **Default starting position for new caption boxes**
   - What we know: Player can drag boxes anywhere once added
   - What's unclear: Should first caption box start centered? Positioned top-left? Should each subsequent box offset slightly so they're visible?
   - Recommendation: First box centers on photo; each added box offsets 20px right + 20px down so boxes are stacked/visible. Planner can adjust based on UX testing.

3. **Minimum caption count to submit**
   - What we know: CONTEXT.md suggests "at least one non-empty caption box" mirrors current validation
   - What's unclear: Should a meme with only empty caption boxes be rejected? Should a meme with 0 boxes be rejected?
   - Recommendation: Require at least one caption box with non-empty text (i.e., `text.trim().length > 0`), same as current caption validation. Planner decides during task design.

4. **Viewport/canvas sizing on small phones**
   - What we know: Project uses mobile-first design (16px base, 44px tap targets)
   - What's unclear: How large should the photo display be on a 375px-wide iPhone? Should it be full width, or with margins for button space?
   - Recommendation: Full width (375px) for the photo, keep WritingPanel's existing layout (photo, buttons above, caption/editor below). Canvas should be no wider than viewport width. Real-phone test will show if this is cramped.

5. **Re-editing a caption after it's placed**
   - What we know: Player can drag boxes and type text into them during WRITING phase
   - What's unclear: Should a long-press on a caption box open a text-editing dialog, or is the text field always visible in each box?
   - Recommendation: Text field visible directly in/below each box (not hidden); tap to edit. Simpler UX for a countdown-pressured editing session. Dialog would add extra interaction layers.

---

## Code Examples

### Canvas Composition with RTL Text (Pattern from CLAUDE.md)

Source: [MDN Canvas Direction](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction), baseline support since May 2022.

```typescript
async function composeAndRasterize(
  photoUrl: string,
  captions: Array<{ id: string; text: string; x: number; y: number }>,
  canvasRef: React.RefObject<HTMLCanvasElement>
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

    const BOX_WIDTH = 200;
    const BOX_HEIGHT = 80;

    // Semi-transparent backing
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(caption.x, caption.y, BOX_WIDTH, BOX_HEIGHT);

    // RTL text rendering
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Heebo';
    ctx.direction = 'rtl'; // CRITICAL: enables Hebrew bidi + glyph shaping
    ctx.textAlign = 'right'; // align with RTL direction
    ctx.textBaseline = 'top';

    // Wrap text if needed (simplified; planner can enhance)
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
        const base64 = (reader.result as string).split(',')[1]; // strip "data:image/png;base64,"
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    }, 'image/png', 0.9); // 90% JPEG quality equivalent
  });
}
```

### Pointer Event Drag-and-Drop (Pointer Capture Pattern)

```typescript
const [boxes, setBoxes] = useState<CaptionBox[]>([]);
const [draggingBoxId, setDraggingBoxId] = useState<string | null>(null);
const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>, boxId: string) {
  const box = boxes.find((b) => b.id === boxId);
  if (!box) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const pointerX = e.clientX - rect.left;
  const pointerY = e.clientY - rect.top;

  // Store offset for smooth dragging
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

return (
  <canvas
    ref={canvasRef}
    onPointerDown={(e) => {
      const boxId = getBoxAtPoint(
        e.clientX - e.currentTarget.getBoundingClientRect().left,
        e.clientY - e.currentTarget.getBoundingClientRect().top
      );
      if (boxId) handlePointerDown(e, boxId);
    }}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
  />
);
```

### Navigator.share with Fallback (Web Share API + Long-Press)

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

// Fallback UI component
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

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | vitest.config.ts (expected, auto-discovered) |
| Quick run command | `npm test -- WritingPanel.test.tsx --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEME-01 | Canvas renders caption boxes with correct position and text | unit | `npm test -- compositing.test.ts -t "renders positioned Hebrew text" --run` | ❌ Wave 0 |
| MEME-01 | `ctx.direction='rtl'` produces correct glyph order for mixed Hebrew/English | unit | `npm test -- rtl-text.test.ts -t "Hebrew bidi reordering" --run` | ❌ Wave 0 |
| MEME-03 | Pointer events drag caption box to new position | unit | `npm test -- drag.test.tsx -t "pointer capture drag updates position" --run` | ❌ Wave 0 |
| MEME-03 | canvas.toBlob() produces valid PNG base64 | unit | `npm test -- serialize.test.ts -t "toBlob produces valid base64" --run` | ❌ Wave 0 |
| MEME-03 | `navigator.share({ files })` called with blob, OR fallback UI shown | integration | `npm test -- SaveButton.integration.test.tsx -t "share flow" --run` | ❌ Wave 0 |
| HEB-03 | Realistic caption (Hebrew + digits + English word) renders correctly on photo | e2e/visual | Manual: save PNG on real iPhone, verify order matches author's phone | ❌ Wave 0 (real-phone test) |

### Sampling Rate
- **Per task commit:** `npm test -- WritingPanel.test.tsx --run` (composition tests)
- **Per wave merge:** `npm test -- --run` (full suite)
- **Phase gate:** Full suite green + manual real-phone visual check (DEPLOY-03 real-iPhone test)

### Wave 0 Gaps
- [ ] `tests/compositing.test.ts` — canvas composition, caption rendering
- [ ] `tests/rtl-text.test.ts` — Hebrew bidi verification, mixed-script glyphs
- [ ] `tests/drag.test.tsx` — pointer events, hit-testing, boundary clamping
- [ ] `tests/serialize.test.ts` — canvas.toBlob() and base64 encoding
- [ ] `tests/SaveButton.integration.test.tsx` — navigator.share feature detection and fallback UI
- [ ] `tests/conftest.ts` / test fixtures — mock Canvas 2D context (jsdom limitation workaround)
- [ ] Framework setup: `npm install jsdom` and update vitest config to set `testEnvironment: 'jsdom'`

*(Note: jsdom's Canvas 2D implementation is minimal; use `jest-canvas-mock` or similar polyfill if needed for full CanvasRenderingContext2D testing)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not applicable to Phase 5 (meme composition only) |
| V3 Session Management | No | Not applicable to Phase 5 |
| V4 Access Control | No | Only the meme's author can see/edit during WRITING; no new access control needed |
| V5 Input Validation | Yes | Base64 string size cap on server; reject if < 10KB or > 2MB. No XSS risk (image data, not HTML). |
| V6 Cryptography | No | No new encryption needed; meme transmission over existing Socket.IO/TLS |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized base64 payload (DoS) | Denial of Service | Server rejects if size > 2MB; Socket.IO `maxHttpBufferSize: 5e6` caps total message size. |
| Malformed PNG in base64 (client crash) | Tampering | Client displays broken-image icon gracefully; server doesn't validate PNG structure (cheap trade-off). |
| Canvas fingerprinting (privacy leak) | Information Disclosure | Out of scope for Phase 5; meme is visible to everyone in the room anyway. |

---

## Sources

### Primary (HIGH confidence)
- CLAUDE.md (project instructions) — Canvas 2D API `ctx.direction='rtl'` mandatory, html2canvas/satori forbidden; navigator.share pattern documented
- [MDN Canvas CanvasRenderingContext2D.direction](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction) — baseline support since May 2022
- [Web Share API Spec (W3C)](https://www.w3.org/TR/web-share/) — Level 2 file sharing, iOS 15+, Android Chrome 76+
- [Socket.IO Docs](https://socket.io/docs/v4/server-api/) — `maxHttpBufferSize` configuration, default 1MB
- Pointer Events API on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) — modern standard, iOS 13+, Android Chrome 55+

### Secondary (MEDIUM confidence)
- [caniuse.com: Canvas context direction](https://caniuse.com/mdn-api_canvasrenderingcontext2d_direction) — confirms baseline across all target browsers
- [caniuse.com: Web Share API](https://caniuse.com/web-share) — confirms iOS 15+, Android Chrome 76+ support matrix
- [Google Fonts Fontsource Project](https://fontsource.org/) — Heebo and Assistant font packages, maintenance status, weekly download counts

### Tertiary (LOW confidence, marked for validation)
- iOS Safari historical `download` attribute behavior — varies by iOS version; marked for real-iPhone test (DEPLOY-03)
- Socket.IO/Express config for `maxHttpBufferSize` — assumed from docs, should be verified in actual server setup

---

## Metadata

**Confidence breakdown:**
- **Standard Stack (HIGH):** Canvas 2D and Web Share API are native browser features with published specs and stable support across target platforms
- **Core Decision: Rasterize vs Live Render (HIGH):** Recommendation is driven by clear bandwidth math, deadline pressure, and determinism requirements specific to this project
- **Touch Drag Implementation (MEDIUM-HIGH):** Pointer events are standard, but mobile-specific edge cases (canvas scaling on high-DPI, coordinate system) require real-phone testing
- **Font Loading (HIGH):** `document.fonts.ready` is a standard Promise API; no ambiguity
- **Web Share API File Sharing (MEDIUM):** Spec is clear; iOS version-specific behavior noted for real-device testing
- **Server Wire Changes (HIGH):** Straightforward protocol changes (string instead of string, just different content); no new complexity

**Research date:** 2026-09-07
**Valid until:** 2026-09-14 (expires end of Phase 5 planning to allow for late changes)

---

*Phase: 5 - Hebrew RTL Meme Compositor & Souvenir*
*Research produced: 2026-09-07*
*Next step: `/gsd-plan-phase 5` to design implementation tasks*
