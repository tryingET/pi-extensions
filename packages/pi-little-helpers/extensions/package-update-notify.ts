/**
 * Package update notifier extension for pi.
 * Checks for updates to pinned npm and git packages in pi settings.
 */

import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  buildCompareUrl,
  type CheckResult,
  compareVersion,
  extractPackages,
  fetchLatestGitSha,
  fetchLatestNpmVersion,
  formatDetailedUpdates,
  formatUpdateSummary,
  GLOBAL_SETTINGS,
  isPinnedSha,
  markAutoCheck,
  mergePackages,
  type PackageUpdate,
  readSettings,
  resolveGitRef,
  shouldRunAutoCheck,
} from "../lib/package-utils.js";

async function checkPackageUpdates(cwd: string): Promise<CheckResult> {
  const projectSettingsPath = resolve(cwd, ".pi", "settings.json");
  const [globalSettings, projectSettings] = await Promise.all([
    readSettings(GLOBAL_SETTINGS),
    readSettings(projectSettingsPath),
  ]);

  const merged = mergePackages(extractPackages(globalSettings), extractPackages(projectSettings));

  const updates: PackageUpdate[] = [];
  const skippedUnpinned: string[] = [];
  const errors: string[] = [];

  const checks = merged.map(async (pkg) => {
    if (pkg.type === "npm") {
      if (!pkg.version) {
        skippedUnpinned.push(pkg.name);
        return;
      }

      const latest = await fetchLatestNpmVersion(pkg.name);
      if (!latest) {
        errors.push(`Failed to check ${pkg.name}`);
        return;
      }

      if (compareVersion(latest, pkg.version) > 0) {
        updates.push({
          name: pkg.name,
          current: pkg.version,
          latest,
          source: pkg.source,
        });
      }
    } else {
      if (!pkg.ref) {
        skippedUnpinned.push(pkg.displayName);
        return;
      }

      const latest = await fetchLatestGitSha(pkg.url);
      if (!latest) {
        errors.push(`Failed to check ${pkg.displayName}`);
        return;
      }

      const currentRef = pkg.ref;

      if (isPinnedSha(currentRef)) {
        if (currentRef.toLowerCase() !== latest.toLowerCase()) {
          updates.push({
            name: pkg.displayName,
            current: currentRef.slice(0, 7),
            latest: latest.slice(0, 7),
            source: pkg.source,
            compareUrl: buildCompareUrl(pkg.url, currentRef, latest),
          });
        }
      } else {
        const resolved = await resolveGitRef(pkg.url, currentRef);
        if (!resolved) {
          errors.push(`Failed to resolve ${pkg.displayName}@${currentRef}`);
          return;
        }

        if (resolved.sha.toLowerCase() !== latest.toLowerCase()) {
          updates.push({
            name: pkg.displayName,
            current: `${currentRef} (${resolved.sha.slice(0, 7)})`,
            latest: `HEAD (${latest.slice(0, 7)})`,
            source: pkg.source,
            compareUrl: buildCompareUrl(pkg.url, resolved.sha, latest),
          });
        }
      }
    }
  });

  await Promise.all(checks);

  return { updates, skippedUnpinned, errors };
}

async function runCheck(ctx: ExtensionContext, notifyWhenUpToDate = false): Promise<void> {
  const { updates, skippedUnpinned, errors } = await checkPackageUpdates(ctx.cwd);

  if (updates.length > 0) {
    ctx.ui.setStatus("package-updates", `updates: ${updates.length}`);
    ctx.ui.notify(
      `Package updates available (${updates.length}): ${formatUpdateSummary(updates)}. Run /package-updates for details.`,
      "warning",
    );
    return;
  }

  ctx.ui.setStatus("package-updates", undefined);
  if (notifyWhenUpToDate) {
    if (errors.length > 0) {
      ctx.ui.notify(`Some checks failed: ${errors.join(", ")}`, "warning");
    } else if (skippedUnpinned.length > 0) {
      ctx.ui.notify(
        `All pinned packages up to date. Unpinned: ${skippedUnpinned.slice(0, 3).join(", ")}${skippedUnpinned.length > 3 ? ` (+${skippedUnpinned.length - 3})` : ""}`,
        "info",
      );
    } else {
      ctx.ui.notify("All pinned packages are up to date.", "info");
    }
  }
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    void (async () => {
      if (!(await shouldRunAutoCheck())) return;
      await markAutoCheck();
      await runCheck(ctx, false);
    })();
  });

  pi.registerCommand("package-updates", {
    description: "Check for updates to pinned npm and git packages in pi settings",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      try {
        await markAutoCheck();

        const { updates, skippedUnpinned, errors } = await checkPackageUpdates(ctx.cwd);

        if (updates.length > 0) {
          ctx.ui.setStatus("package-updates", `updates: ${updates.length}`);

          let message = `📦 ${updates.length} update(s) available:\n${formatDetailedUpdates(updates)}`;

          if (skippedUnpinned.length > 0) {
            message += `\n\nUnpinned (not checked): ${skippedUnpinned.join(", ")}`;
          }

          ctx.ui.notify(message, "warning");

          for (const u of updates) {
            if (u.compareUrl) {
              console.log(`Compare ${u.name}: ${u.compareUrl}`);
            }
          }
        } else {
          ctx.ui.setStatus("package-updates", undefined);

          let message = "✅ All pinned packages are up to date.";
          if (errors.length > 0) {
            message = `⚠️ Some checks failed:\n  ${errors.join("\n  ")}`;
            ctx.ui.notify(message, "warning");
          } else if (skippedUnpinned.length > 0) {
            message += `\n\nUnpinned (not checked): ${skippedUnpinned.join(", ")}`;
            ctx.ui.notify(message, "info");
          } else {
            ctx.ui.notify(message, "info");
          }
        }
      } catch (err) {
        ctx.ui.notify(`Package update check failed: ${err}`, "error");
      }
    },
  });
}
