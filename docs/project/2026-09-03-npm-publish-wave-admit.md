---
summary: "Operator path for one npm-publish admit per release wave. GitHub environment fields only; agent cannot flip required-reviewers."
read_when:
  - "Changing GitHub environment npm-publish protection rules."
  - "A publish wave is waiting on N environment approvals."
---

# npm-publish wave admit

Human admission is **one review of the combined release-please PR**, not N `npm-publish` environment approvals. `publish.yml` still names environment `npm-publish` because that string is the npm OIDC Trusted Publisher binding.

This task does not change repository settings. Record the clicks below as evidence if an operator applies them.

## Do not change

| Surface | Keep |
|---|---|
| Settings → Actions → General → Workflow permissions | **Read repository contents and packages permissions** (`default_workflow_permissions: read`). Do not set write. |
| npm Trusted Publisher | Workflow `publish.yml`, environment name `npm-publish`, no `NPM_TOKEN` secret. |
| `publish.yml` job `environment:` | Stay `npm-publish` so OIDC identity matches the Trusted Publisher. |

## Exact GitHub environment fields

Open [Environments](https://github.com/tryingET/pi-extensions/settings/environments) → `npm-publish`.

| Field | Recommended value | Why |
|---|---|---|
| Name | `npm-publish` | Must match npm Trusted Publisher and `publish.yml`. |
| Required reviewers | **empty** (remove every reviewer) | Each publish job is its own deployment. Reviewers here become one human wait per `releaseOrder` member. |
| Wait timer | `0` minutes | Extra delay stacked on sequential `gh run watch`. |
| Prevent self-review | n/a when reviewers are empty | — |
| Allow administrators to bypass configured protection rules | leave default | Not a substitute for emptying reviewers. |
| Custom deployment protection rules | none | — |
| Deployment branches and tags | No restriction, or Selected: `main` | `release-please.yml` dispatches `publish.yml` with `--ref main`. |
| Environment secrets | none | OIDC Trusted Publishing; do not add `NPM_TOKEN`. |
| Environment variables | none required | — |

After reviewers are empty, merging the single release-please PR is the wave admit. `release-please.yml` then dispatches each tag in `releaseOrder` without further environment waits.

## Optional stronger gate (out of AK #5340 allowed paths)

If a dedicated environment approval is still wanted:

1. Create environment `npm-wave-admit` with **one** required reviewer.
2. Attach it to the `release-please.yml` job that runs “Dispatch dependency-first publication wave” (that workflow is outside this task’s allowed paths).
3. Keep `npm-publish` with **zero** reviewers so OIDC continues to work and package jobs do not re-ask.

Do not move `environment: npm-publish` off the publish job unless the npm Trusted Publisher binding is updated in the same change.

## Operator evidence to record

If settings were changed, record:

- environment name
- Required reviewers (count and logins, or empty)
- Wait timer
- Deployment branches and tags
- Workflow permissions still `read`
- npm Trusted Publisher still `publish.yml` + `npm-publish`

This session did not change GitHub settings.
