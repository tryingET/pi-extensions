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

# Focused inner-loop validation after a coherent slice, never after every write.
# LOOP_PATHS may contain newline-separated repo-relative paths; otherwise the
# current unstaged, staged, and untracked working-tree paths are used.
loop-verify-fast:
    #!/usr/bin/env bash
    set -euo pipefail
    declare -a changed=()
    if [[ ${LOOP_PATHS+x} ]]; then
      [[ -n "$LOOP_PATHS" ]] || { echo "error: LOOP_PATHS was supplied but empty" >&2; exit 2; }
      mapfile -t changed <<<"$LOOP_PATHS"
    else
      mapfile -d '' -t changed < <({ git diff --name-only -z -- .; git diff --cached --name-only -z -- .; git ls-files --others --exclude-standard -z .; } | sort -zu)
    fi
    ((${#changed[@]} > 0)) || { echo "loop-verify-fast: no changed paths; nothing to validate"; exit 0; }
    declare -A package_set=()
    root_check=0
    for path in "${changed[@]}"; do
      [[ -n "$path" ]] || { echo "error: LOOP_PATHS contains an empty line" >&2; exit 2; }
      [[ "$path" != /* && "$path" != .. && "$path" != ../* && "$path" != */../* && "$path" != */.. ]] || { echo "error: LOOP_PATHS must contain repo-relative paths without '..': $path" >&2; exit 2; }
      if [[ "$path" == packages/* ]]; then
        rest="${path#packages/}"
        package="packages/${rest%%/*}"
        [[ -f "$package/package.json" && ! -L "$package" && ! -L "$package/package.json" ]] || { echo "error: trusted top-level package root not found for $path" >&2; exit 2; }
        package_set["$package"]=1
      else
        root_check=1
      fi
    done
    echo "loop-verify-fast: coherent-slice validation"
    if ((${#package_set[@]} > 0)); then
      declare -a args=()
      while IFS= read -r package; do args+=(--package "$package"); done < <(printf '%s\n' "${!package_set[@]}" | sort)
      ./scripts/ci/packages.sh pre-commit "${args[@]}"
    fi
    if ((root_check)); then ./scripts/ci/smoke.sh; fi

# Classify explicit LOOP_PATHS, or the complete working-tree change set, as
# bounded, expanded, or wide without executing validation.
loop-impact-plan:
    #!/usr/bin/env bash
    set -euo pipefail
    declare -a changed=()
    if [[ ${LOOP_PATHS+x} ]]; then
      [[ -n "$LOOP_PATHS" ]] || { echo "error: LOOP_PATHS was supplied but empty" >&2; exit 2; }
      mapfile -t changed <<<"$LOOP_PATHS"
    else
      mapfile -d '' -t changed < <({ git diff --name-only -z -- .; git diff --cached --name-only -z -- .; git ls-files --others --exclude-standard -z .; } | sort -zu)
    fi
    echo "loop-impact-plan: changed paths"
    if ((${#changed[@]} == 0)); then echo "(none)"; echo "impact=bounded"; echo "next=none"; echo "reason=no changed paths"; exit 0; fi
    printf '%s\n' "${changed[@]}"
    declare -A package_set=()
    root_local=0
    wide=0
    for path in "${changed[@]}"; do
      [[ -n "$path" ]] || { echo "error: LOOP_PATHS contains an empty line" >&2; exit 2; }
      [[ "$path" != /* && "$path" != .. && "$path" != ../* && "$path" != */../* && "$path" != */.. ]] || { echo "error: LOOP_PATHS must contain repo-relative paths without '..': $path" >&2; exit 2; }
      if [[ "$path" == packages/* ]]; then
        rest="${path#packages/}"
        package="packages/${rest%%/*}"
        if [[ ! -f "$package/package.json" || -L "$package" || -L "$package/package.json" ]]; then echo "impact=wide"; echo "next=just loop-impact-wide"; echo "reason=trusted top-level package ownership cannot be resolved for $path"; exit 0; fi
        package_set["$package"]=1
      elif [[ "$path" == package.json || "$path" == package-lock.json || "$path" == Justfile || "$path" == scripts/* || "$path" == apps/* || "$path" == tools/* ]]; then
        wide=1
      elif [[ "$path" == docs/* || "$path" == policy/* || "$path" == governance/* || "$path" == ontology/* || "$path" == README.md || "$path" == README.terse.md || "$path" == AGENTS.md || "$path" == .pi/* ]]; then
        root_local=1
      else
        wide=1
      fi
    done
    package_count=${#package_set[@]}
    if ((wide)); then
      echo "impact=wide"; echo "next=just loop-impact-wide"; echo "reason=root runtime, dependency, script, build, or unclassified surface changed"
    elif ((package_count > 1 || (package_count > 0 && root_local))); then
      echo "impact=expanded"; echo "next=just loop-impact-run"; echo "reason=multiple package roots or package plus root documentation/policy changed"
    else
      echo "impact=bounded"; echo "next=just loop-impact-run"; echo "reason=one package root or root documentation/policy-only slice changed"
    fi

# Run bounded/expanded impact validation. Refuse wide changes; those require an
# explicit reason through loop-impact-wide.
loop-impact-run:
    #!/usr/bin/env bash
    set -euo pipefail
    declare -a changed=()
    if [[ ${LOOP_PATHS+x} ]]; then
      [[ -n "$LOOP_PATHS" ]] || { echo "error: LOOP_PATHS was supplied but empty" >&2; exit 2; }
      mapfile -t changed <<<"$LOOP_PATHS"
    else
      mapfile -d '' -t changed < <({ git diff --name-only -z -- .; git diff --cached --name-only -z -- .; git ls-files --others --exclude-standard -z .; } | sort -zu)
    fi
    ((${#changed[@]} > 0)) || { echo "loop-impact-run: no changed paths; nothing to validate"; exit 0; }
    declare -A package_set=()
    root_check=0
    wide=0
    for path in "${changed[@]}"; do
      [[ -n "$path" ]] || { echo "error: LOOP_PATHS contains an empty line" >&2; exit 2; }
      [[ "$path" != /* && "$path" != .. && "$path" != ../* && "$path" != */../* && "$path" != */.. ]] || { echo "error: LOOP_PATHS must contain repo-relative paths without '..': $path" >&2; exit 2; }
      if [[ "$path" == packages/* ]]; then
        rest="${path#packages/}"
        package="packages/${rest%%/*}"
        [[ -f "$package/package.json" && ! -L "$package" && ! -L "$package/package.json" ]] || { echo "error: trusted top-level package ownership cannot be resolved for $path" >&2; exit 2; }
        package_set["$package"]=1
      elif [[ "$path" == package.json || "$path" == package-lock.json || "$path" == Justfile || "$path" == scripts/* || "$path" == apps/* || "$path" == tools/* ]]; then
        wide=1
      elif [[ "$path" == docs/* || "$path" == policy/* || "$path" == governance/* || "$path" == ontology/* || "$path" == README.md || "$path" == README.terse.md || "$path" == AGENTS.md || "$path" == .pi/* ]]; then
        root_check=1
      else
        wide=1
      fi
    done
    if ((wide)); then echo "loop-impact-run: refused wide scope; run LOOP_WIDE_REASON='<reason>' just loop-impact-wide" >&2; exit 2; fi
    if ((${#package_set[@]} > 0)); then
      declare -a args=()
      while IFS= read -r package; do args+=(--package "$package"); done < <(printf '%s\n' "${!package_set[@]}" | sort)
      ./scripts/ci/packages.sh pre-push "${args[@]}"
    fi
    if ((root_check)); then ./scripts/ci/smoke.sh; fi

# Run explicitly accepted wide validation.
loop-impact-wide:
    @if [ -z "${LOOP_WIDE_REASON:-}" ]; then echo "error: LOOP_WIDE_REASON is required for wide validation" >&2; exit 2; fi
    @echo "loop-impact-wide: explicit wide validation accepted; reason=${LOOP_WIDE_REASON}"
    @just ci

# Repo-declared landing/readiness gate.
loop-landing-check:
    @just ci

# No build/run/dev target: this repo is a monorepo control plane rather than a single buildable or long-running app surface.
