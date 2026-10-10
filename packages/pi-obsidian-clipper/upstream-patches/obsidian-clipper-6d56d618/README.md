---
summary: "Tracked patch against Obsidian Web Clipper 6d56d618: opt-in page images for the Interpreter (OpenAI-compatible providers), with its build and verification recipe."
task_id: 6889
read_when:
  - "Building the patched Clipper with Interpreter page images."
  - "Preparing or reviewing the upstream proposal for Interpreter images."
---

# Interpreter page images: patch for upstream 6d56d618

Upstream is `obsidianmd/obsidian-clipper` at
`6d56d618b00bd970aa738d6a7a61edee27783e81` (1.7.1). That was upstream `main`
when checked on 2026-10-10. Obsidian owns the code; this directory only carries
a patch. The Web Store build is unchanged, and nothing here installs into any
browser profile.

`0001-interpreter-opt-in-page-images.patch`
(SHA-256 `00044aca8bc7990d5817ac85d35098dd6351d3603ed1a5c1219bdd944d303042`)
makes these changes:

- It adds a per-model **Send page images** checkbox (`ModelConfig.sendImages`,
  off by default).
- When the checkbox is on and the provider uses the default OpenAI-compatible
  request format, the extension collects images from the links in the page
  Markdown (`{{content}}`), in document order:
  - It takes at most 4, accepting only http(s), skipping SVG, and fetching with
    `credentials: 'omit'`.
  - It accepts only png/jpeg/webp/gif of at most 2 MiB and at least 16×16 px.
  - It sends them as base64 `data:` URLs in `image_url` parts of the prompt
    message, so the model endpoint never fetches web URLs.
- Images that fail these checks are skipped, and the request goes out with the
  rest, or text only if none remain.
- Text-only behaviour is unchanged for the other provider formats (Anthropic,
  Gemini, Ollama, Azure, DeepSeek, Perplexity, Hugging Face), and for models
  without the checkbox.
- New `src/utils/interpreter-images.ts` with vitest coverage; English locale
  strings only (other locales fall back to English).

Upstream detail found along the way: `handleInterpreterUI` reads `variables.content`,
which is always empty because template variables are keyed `{{content}}`. The
patch reads `variables['{{content}}']` for images and leaves that existing
lookup alone.

## Build recipe

From a clean checkout or archive of the exact upstream commit, using its
unchanged lock:

```bash
git apply --check 0001-interpreter-opt-in-page-images.patch   # from the upstream root
git apply 0001-interpreter-opt-in-page-images.patch
npm ci
TZ=America/Los_Angeles npx vitest run   # 218/218 at verification
npx webpack --env BROWSER=chrome --mode production   # unpacked build in dist/
```

The `TZ` setting is needed because the upstream `youtube` template fixture
depends on the time zone. It fails without the patch too. Plain `tsc --noEmit`
reports the same two pre-existing `TS1323` errors with and without the patch.

## Verification (AK6889, 2026-10-10)

- **Lane probes:** two synthetic data-URL probes to `baseline-multimodal`
  answered `red` and `blue` correctly (HTTP 200).
- **Isolated-browser proof:** scratch Chromium 153 in a nested niri, loading the
  unpacked patched build. The models were added through the native settings
  modal, and the checkbox persisted `sendImages: true` while the control model
  had none. Seeded providers and models were preserved.
- **Synthetic page, opted-in model:**
  - the extension fetched exactly the first 4 content images;
  - one POST from the `chrome-extension://` origin carried 4 `data:image/png`
    parts, with no preflight;
  - the answer was `purple, red, green, blue`, the true colours in order.
- **Text-only control model:** no image fetches, a plain-string prompt, and the
  answer `NONE`.
- **First attempt failed:** before the `{{content}}` fix, the opted-in run
  attached 0 images. Both runs' artifacts are retained under package-ignored
  `.scratch/ak6889-multimodal-proof/`.

Not covered: Firefox/Safari builds, real-world sites (for example, Wikipedia's
`File:` links would be skipped as `text/html`; this is covered by unit tests,
not a browser run), large images near the cap, latency, and other locales'
strings.

## Upstream proposal (not filed)

The issue-tracker reference for this upstream records an **issue** channel,
with contributions welcomed on "help wanted" issues. No outside-PR acceptance
policy is established. The natural first step is a feature request in the
native `feature_request.md` form, offering this patch as a PR. Filing needs the
issue-tracker workflow (`bin/it draft`/review/preview) and a separate operator
OK; it has not been done.

Draft feature-request body:

> **Describe the solution you'd like**
> An opt-in, per-model "Send page images" setting for Interpreter. When enabled
> for an OpenAI-compatible provider, Web Clipper attaches up to 4 images from the
> page content to the Interpreter request as `image_url` parts with base64
> `data:` URLs. The extension fetches them with credentials omitted; only
> png/jpeg/webp/gif images of at most 2 MiB are sent, and SVGs and tiny images
> are skipped. Vision-capable models, including local ones, could then answer
> prompts about charts, diagrams or photos on the page. Other provider formats
> and models without the setting keep the current text-only requests. I have a
> small implementation with tests and can open a PR if this is welcome.
