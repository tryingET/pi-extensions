---
summary: "AK6870 isolated-browser Interpreter qualification: fresh owner export, keyless loopback observed, additive native-UI config preserved, real extension-origin POST returned prompts_responses."
task_id: 6870
read_when:
  - "Configuring Obsidian Web Clipper Interpreter against the workstation endpoint."
  - "Assessing what the AK6870 browser proof does and does not establish."
---

# AK6870 browser Interpreter qualification — 2026-10-10

This is a dated observation. It is not a standing guarantee about every browser,
profile, extension version or later workstation routing state. AK evidence for
AK6870 is canonical; this document is its projection.

## Authority

Exact task AK6870 (AK6634 block 1). The executor was a fresh session the operator
launched. A native operator interview then authorized exactly the following:

- a read-only owner export (no `--write`);
- one synthetic no-Authorization auth probe;
- an isolated Chromium proof in a nested niri, with seeded fixtures and model
  POSTs carrying synthetic text only;
- package-scoped docs or adapter changes, landed through `land-canonical.sh`.

The interview also recorded these limits:

- no personal browser profile or installed extension was touched;
- no push, tag, release or publication;
- the workstation canonical declaration file was not modified.

Deferral 634 was released with that reason, and the task was claimed with a
finite lease.

## Observations

1. **Fresh owner declaration.** `lane-op.py provider-contract baseline-text
   --surface canonical` was run without `--write` and returned mode `print`.
   Its `.contract` went to a private 0600 package-scratch file, selected through
   `PI_OBSIDIAN_CLIPPER_CONTRACT`.
   - Fresh Pi `status`/`setup` reported `generatedAt 2026-10-10T05:57:14Z`,
     `freshness: fresh`, exact alias `baseline-multimodal` with text and image
     input, and base URL `http://127.0.0.1:1234/v1`.
   - The canonical workstation file still carries its earlier 2026-10-04
     declaration. Refreshing it is the workstation owner's job.
2. **Authentication requirement.** One POST to `/v1/chat/completions` asked for
   `baseline-multimodal` with `max_tokens: 8` and no `Authorization` header. It
   returned **HTTP 200**.
   - The adapter does not check auth.
   - The running vLLM backend has no `--api-key` flag.
   - Conclusion: the loopback endpoint was **keyless at observation**. The native
     UI still requires a nonempty key field, so the operator-approved nonsecret
     placeholder `local` was entered in the isolated profile only. It is not a
     secret and no real key passed through Pi.
3. **Isolated browser.**
   - Browser: `/usr/bin/chromium` 153.0.8010.47 with a fresh scratch
     `--user-data-dir`, inside a nested niri (workstation skill helper).
     DevTools listened only on a loopback ephemeral port.
   - Extension: an unpacked Obsidian Web Clipper 1.7.1, built with
     `webpack --env BROWSER=chrome` from a scratch copy of pinned upstream
     `6d56d618b00bd970aa738d6a7a61edee27783e81`. The evidence snapshot's
     non-`node_modules` hash inventory was byte-identical before and after.
   - Manifest: MV3, `host_permissions` include `<all_urls>`.
4. **Additive configuration.**
   - Pre-existing fixture providers, models and a template were seeded first:
     two `.invalid` providers with a fixture key string and an interpreter
     prompt template.
   - The workstation provider (Custom preset, full chat-completions URL) and the
     `baseline-multimodal` model were then appended **through the native settings
     modals**. These were DOM events driven over CDP, not a physical pointer.
   - Order-independent comparison: both seeded providers, both seeded models and
     the template were preserved. The counts went from 2 to 3. Interpreter was
     enabled, auto-run stayed off, and no settings import was used.
   - The native UI assigns its own timestamp provider id, not the preview's
     `workstation` id.
5. **Real Interpreter request.**
   - Steps: `chrome.action.openPopup()` on a synthetic loopback page, select
     "Workstation baseline-multimodal", click Interpret.
   - CDP Network on the popup recorded exactly **one POST**. **No preflight or
     OPTIONS request** was recorded. That is consistent with the endpoint's
     OPTIONS returning 501: had a preflight occurred, the POST would have failed.
   - Request: `Origin: chrome-extension://<id>` and `Sec-Fetch-Mode: cors`.
   - Response: HTTP 200 with `access-control-allow-origin: *`.
   - The body's `choices[0].message.content` was
     `{"prompts_responses":{"prompt_1":"AK6870-ZETA-PLUM"}}` with
     `finish_reason: stop`. The popup state became `done`, and the note preview
     contained the page marker token the model had extracted.
   - Clip/save was never clicked. No vault write occurred.
6. **Teardown.** Chromium closed through CDP, the loopback page server was
   stopped and the nested niri was brought down. The outer focused window was
   never the nested window. The outer focus id changed during the run, which is
   consistent with operator activity. The scratch profile and outputs were
   retained.

## What this does and does not establish

Established for this run:

- a fresh owner export that keeps the exact `baseline-multimodal` alias;
- an observed keyless loopback endpoint;
- additive native-UI configuration that preserved the existing entries;
- an extension-origin request that does not depend on CORS preflight;
- a real `prompts_responses` round trip.

Not established:

- the operator's personal profile, Brave, Firefox or the Chrome Web Store build;
- future auth posture, if the workstation owner later adds keys;
- vLLM environment-variable keys (only absent from the launch flags);
- reasoning-length or timeout behaviour on large pages;
- multimodal payloads. The Interpreter stays text-only and save stays
  unsupported, by operator decision.

Applying the same configuration to a personal profile needs a separately exact
permit. Pi adapter runtime was unchanged by this task. `status` and `setup`
still never probe live or browser state.

## Retained artifacts

- Package-ignored copy: `packages/pi-obsidian-clipper/.scratch/ak6870-browser-proof/`,
  containing the driver, manifest observation, redacted network capture, popup
  result, storage preservation JSON, page fixture, build log and snapshot hash
  inventories.
- Original scratch: `~/.local/state/pi-quests/tmp/ak6870-browser.6CJEhZ/`,
  including the isolated profile.
- Export and probe logs: `.scratch/ak6870-{provider-contract,provider-export-envelope}.json`,
  `.scratch/ak6870-{status,setup}.log` and `.scratch/ak6870-auth-probe.*`.
