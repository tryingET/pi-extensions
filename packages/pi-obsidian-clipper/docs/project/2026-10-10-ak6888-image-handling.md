---
summary: "AK6888: how images end up in Clipper notes, as remote Markdown links never downloaded; srcset/lazy/figure behavior; a Wikipedia File-page link defect; Pi native extract parity and its 32 KiB limit."
task_id: 6888
read_when:
  - "Asking why clipped notes contain no imported images, or why images are broken."
  - "Comparing browser Clipper output with Pi obsidian_clipper_extract for images."
---

# AK6888 image handling in clipped notes — 2026-10-10

This is a dated observation, not a guarantee. The canonical record is in AK
(task 6888 and its evidence).

## Authority and setup

The operator authorized this in a native interview, 2026-10-10 (AK evidence
14669). The same interview reversed the earlier text-only Interpreter limit for
image-capable providers; that work is AK6889.

The run reused the AK6870 isolated setup with a **fresh** profile:

- scratch Chromium 153 in a nested niri;
- unpacked Clipper 1.7.1 built from upstream `6d56d618`;
- default template, Interpreter unused.

I recorded the popup note preview and never pressed save. Two pages were used:

- a synthetic loopback page with six image cases;
- one public article chosen by the agent, `https://en.wikipedia.org/wiki/Obsidian`.

The Pi side called the package's `extract()` with the same HTML on Node 26. That
is the code path behind `obsidian_clipper_extract`, but this run did not call
the LLM-facing tool.

## Why no images are "imported"

**Neither Clipper nor this package downloads image files.** Images become remote
Markdown links, `![alt](https://…)`. The note shows them only while the remote
URL is reachable. Nothing is copied into the vault (this package also never
saves). Upstream's README roadmap marks "Save images locally" as done through
Obsidian 1.8.0, so Obsidian itself, not the Clipper, is where images get localized.
That Obsidian feature was not exercised here.

## Synthetic page (browser preview)

| Case | Result in note |
| --- | --- |
| og:image cover, also in the body | kept as a link (not dropped here) |
| inline `<img>` in a paragraph | kept inline, text continues |
| `srcset` 400w/1200w | link to the **largest** candidate (`large.png`) |
| lazy `data-src` placeholder | link to the `data-src` target, even though the browser never fetched it |
| `<figure>` with caption | image kept; caption as a plain paragraph. It runs together on one line with the preceding lazy image, with no blank line between them |
| `<picture>` fallback | link to the `img` fallback |
| 1×1 tracking pixel | dropped |

The Pi native body was **byte-identical** to the browser preview once hosts were
normalized. The browser resolved relative URLs to the loopback origin; native
resolved them to the caller URL.

## Wikipedia (public article)

- **Coverage:** the DOM had 24 images and the note contained 10 image links. Site
  chrome and icons were dropped. The infobox lead image was also dropped.
- **Defect:** 7 of the 10 links point to `https://en.wikipedia.org/wiki/File:…`,
  which is an HTML description page, not an image. In Obsidian these show as
  broken images. Cause, confirmed in source: Defuddle 0.19.2's lazy-image pass
  (`elements/images.js`, for `img[loading="lazy"]`) scans the other attributes.
  It replaces the protocol-relative `src="//thumb…"` with the absolute
  `resource="…/wiki/File:X.jpg"`, because that ends in `.jpg` and is absolute.
  The three images that were not lazy kept real `thumb.wikimedia.org` URLs, with
  tracking query strings attached.
- **Pi native:** **failed** on the rendered HTML (641 KB) with `Native output byte
  limit`. The note is about 56 KB, and the adapter caps native stdout at 32 KiB.
  Normal long articles therefore cannot be captured through Pi today.

## Not established

- Real vault save or attachment download; Obsidian's own localization.
- Other sites' lazy-load schemes, CSS background images, Firefox, and the Web
  Store build.
- An LLM-driven `obsidian_clipper_extract` tool call for these pages.

## Follow-ups proposed, not done

Each of these needs its own authority:

- an upstream Defuddle issue or fix that prefers `src`/`currentSrc` over
  page-link-like `resource` attributes;
- a decision on raising or making configurable the 32 KiB native output cap, a
  bounded change in this package;
- optionally, a blank line between consecutive block images.

Artifacts are in package-ignored `.scratch/ak6888-image-proof/`: note previews,
the rendered Wikipedia HTML, the native output, the driver and the fixture site.
