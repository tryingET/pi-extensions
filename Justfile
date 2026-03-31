# pi-extensions Justfile — standardized command surface
# Contract: /home/tryinget/ai-society/softwareco/owned/docs/project/standardized-justfile-contract.md
# Lane addendum: /home/tryinget/ai-society/core/tech-stack-core/src/tech_stack_core/lanes/tech-stack-pi-ts.justfile.md

# Show available targets
help:
    just --list

# Default repo test suite: root node tests + canonical package fan-out
test:
    if [ -f ./scripts/release-components.test.mjs ]; then node --test ./scripts/release-components.test.mjs; fi
    if [ -f ./scripts/pi-host-compatibility-canary.test.mjs ]; then node --test ./scripts/pi-host-compatibility-canary.test.mjs; fi
    ./scripts/ci/packages.sh

# Fast local validation gate
check:
    npm run check

# Non-formatting structural and metadata checks
lint:
    ./scripts/ci/smoke.sh
    npm run release:components:check
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
    ./scripts/ak.sh --doctor
    ./scripts/rocs.sh --doctor

# No build/run/dev target: this repo is a monorepo control plane rather than a single buildable or long-running app surface.
