# pi-extensions Justfile — standardized command surface
# Contract: /home/tryinget/ai-society/softwareco/owned/docs/project/standardized-justfile-contract.md
# Lane addendum: /home/tryinget/ai-society/core/engineering-core/src/engineering_core/lanes/engineering-pi-ts.justfile.md

# Show available targets
help:
    just --list

# Default repo test suite: root node tests + canonical package fan-out
test:
    if [ -f ./scripts/release-components.test.mjs ]; then node --test ./scripts/release-components.test.mjs; fi
    if [ -f ./scripts/pi-host-compatibility-canary.test.mjs ]; then node --test ./scripts/pi-host-compatibility-canary.test.mjs; fi
    if [ -f ./scripts/package-quality-gate.test.mjs ]; then node --test ./scripts/package-quality-gate.test.mjs; fi
    if [ -f ./scripts/root-doc-alignment.test.mjs ]; then node --test ./scripts/root-doc-alignment.test.mjs; fi
    ./scripts/ci/packages.sh

# Fast local validation gate
check:
    npm run check

# Non-formatting structural and metadata checks
lint:
    ./scripts/ci/smoke.sh
    npm run release:components:check
    npm run release:contracts:validate
    npm run compat:canary:validate

# Root formatting stays package-local for now
fmt:
    @echo "info: no canonical root formatter configured; package-local formatters remain authoritative"

# Full local CI-equivalent gate
ci:
    npm run quality:ci

# Toolchain/runtime/environment sanity checks
doctor:
    node --version
    npm --version
    ak --doctor
    ./scripts/rocs.sh --doctor

# Non-failing repo-loop-validation-v1 diagnostics for orchestration loops.
loop-doctor:
    @echo "loop-doctor: pi-extensions diagnostics"
    @git status --short -- . || true
    @node --version || true
    @npm --version || true
    @just --version || true
    @exit 0

# Focused inner-loop validation for current changes.
loop-verify-fast:
    @just check

# Classify changed-file risk for loop validation.
loop-impact-plan:
    @changed="$( { git diff --name-only -- .; git ls-files --others --exclude-standard .; } | sed '/^$/d' | sort -u )"; \
    echo "loop-impact-plan: changed files"; \
    if [ -n "$changed" ]; then printf '%s\n' "$changed"; else echo "(none)"; fi; \
    if printf '%s\n' "$changed" | grep -Eq '^(package(-lock)?\.json$|Justfile$|scripts/|packages/|apps/|tools/|docs/project/engineering-review-surfaces\.md$)'; then \
      echo "impact=wide"; \
      echo "next=just loop-impact-wide"; \
      echo "reason=monorepo runtime/package/script/review surface changed; use the full root CI gate"; \
    else \
      echo "impact=normal"; \
      echo "next=just loop-impact-run"; \
      echo "reason=docs/policy or localized non-runtime surface; use the normal root validation gate"; \
    fi

# Run bounded/expanded impact validation.
loop-impact-run:
    @just check

# Run explicitly accepted wide validation.
loop-impact-wide:
    @echo "loop-impact-wide: explicit wide validation accepted; reason=${LOOP_WIDE_REASON:-not-provided}"
    @just ci

# Repo-declared landing/readiness gate.
loop-landing-check:
    @just ci

# No build/run/dev target: this repo is a monorepo control plane rather than a single buildable or long-running app surface.
