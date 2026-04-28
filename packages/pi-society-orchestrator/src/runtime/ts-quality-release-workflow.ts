import path from "node:path";
import { execFileTextAsync, isBoundaryFailure } from "./boundaries.ts";

export type TsQualityReleaseWorkflowAction =
  | "plan"
  | "prepare"
  | "commit_tag"
  | "push"
  | "create_github_release"
  | "verify_public";

export type TsQualityReleaseWorkflowStepStatus = "planned" | "done" | "failed" | "skipped";

export interface TsQualityReleaseWorkflowStep {
  name: string;
  command: string[];
  status: TsQualityReleaseWorkflowStepStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
}

export interface TsQualityReleaseWorkflowResult {
  ok: boolean;
  action: TsQualityReleaseWorkflowAction;
  cwd: string;
  version: string;
  tag: string;
  applied: boolean;
  externalMutationApproved: boolean;
  steps: TsQualityReleaseWorkflowStep[];
  nextStep: string;
  error?: string;
}

export interface TsQualityReleaseWorkflowParams {
  action?: TsQualityReleaseWorkflowAction;
  cwd?: string;
  version: string;
  apply?: boolean;
  externalMutationApproved?: boolean;
  timeoutMs?: number;
}

export interface TsQualityReleaseWorkflowRunnerOptions {
  defaultCwd?: string;
}

const DEFAULT_TS_QUALITY_CWD = path.join(
  process.env.HOME || "",
  "ai-society",
  "softwareco",
  "owned",
  "ts-quality",
);

const RELEASE_FILE_PATHS = [
  "package.json",
  "packages/ts-quality/package.json",
  "package-lock.json",
  "CHANGELOG.md",
  "docs/releases",
];

function assertVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

function commandText(command: string[]): string {
  return command.join(" ");
}

function plannedStep(name: string, command: string[]): TsQualityReleaseWorkflowStep {
  return { name, command, status: "planned" };
}

export function describeTsQualityReleaseNextStep(result: TsQualityReleaseWorkflowResult): string {
  if (!result.ok) {
    return `Fix failed release workflow step for ${result.tag}: ${result.error || "unknown error"}`;
  }
  switch (result.action) {
    case "plan":
      return `Review the plan, then run prepare with apply=true for ${result.tag}.`;
    case "prepare":
      return result.applied
        ? `Commit/tag the prepared release with action=commit_tag apply=true for ${result.tag}.`
        : `Rerun prepare with apply=true for ${result.tag}.`;
    case "commit_tag":
      return result.applied
        ? `Push main and ${result.tag} with action=push apply=true.`
        : `Rerun commit_tag with apply=true for ${result.tag}.`;
    case "push":
      return result.applied
        ? `Create the GitHub Release with action=create_github_release apply=true externalMutationApproved=true.`
        : `Rerun push with apply=true for ${result.tag}.`;
    case "create_github_release":
      return `Wait for .github/workflows/release.yml, then run verify_public for ${result.tag}.`;
    case "verify_public":
      return `Release ${result.tag} is publicly visible; record release evidence.`;
    default:
      return "Inspect release workflow result.";
  }
}

export class TsQualityReleaseWorkflowRunner {
  readonly defaultCwd: string;

  constructor(options: TsQualityReleaseWorkflowRunnerOptions = {}) {
    this.defaultCwd = options.defaultCwd || DEFAULT_TS_QUALITY_CWD;
  }

  async run(
    params: TsQualityReleaseWorkflowParams,
    signal?: AbortSignal,
  ): Promise<TsQualityReleaseWorkflowResult> {
    const action = params.action || "plan";
    const cwd = path.resolve(params.cwd || this.defaultCwd);
    const version = params.version.trim();
    assertVersion(version);
    const tag = `v${version}`;
    const apply = params.apply === true;
    const externalMutationApproved = params.externalMutationApproved === true;
    const timeoutMs = params.timeoutMs;
    const steps: TsQualityReleaseWorkflowStep[] = [];

    try {
      if (
        apply &&
        (action === "create_github_release" || action === "push") &&
        !externalMutationApproved
      ) {
        throw new Error(`${action} with apply=true requires externalMutationApproved=true.`);
      }

      switch (action) {
        case "plan":
          await this.executeStep(
            steps,
            "plan release",
            ["npm", "run", "--silent", "release:plan", "--", "--version", version],
            cwd,
            true,
            signal,
            timeoutMs,
          );
          break;
        case "prepare":
          await this.executeStep(
            steps,
            "prepare release files",
            [
              "npm",
              "run",
              "--silent",
              "release:prepare",
              "--",
              "--version",
              version,
              ...(apply ? ["--apply"] : []),
            ],
            cwd,
            true,
            signal,
            timeoutMs,
          );
          break;
        case "commit_tag":
          await this.executeStep(
            steps,
            "stage release files",
            ["git", "add", ...RELEASE_FILE_PATHS],
            cwd,
            apply,
            signal,
            timeoutMs,
          );
          await this.executeStep(
            steps,
            "commit release",
            ["git", "commit", "-m", `chore(release): ${tag}`],
            cwd,
            apply,
            signal,
            timeoutMs,
          );
          await this.executeStep(
            steps,
            "tag release",
            ["git", "tag", "-a", tag, "-m", `ts-quality ${tag}`],
            cwd,
            apply,
            signal,
            timeoutMs,
          );
          break;
        case "push":
          await this.executeStep(
            steps,
            "push main",
            ["git", "push", "origin", "main"],
            cwd,
            apply,
            signal,
            timeoutMs,
          );
          await this.executeStep(
            steps,
            "push tag",
            ["git", "push", "origin", tag],
            cwd,
            apply,
            signal,
            timeoutMs,
          );
          break;
        case "create_github_release":
          await this.executeStep(
            steps,
            "create GitHub Release",
            [
              "npm",
              "run",
              "--silent",
              "release:github",
              "--",
              "--version",
              version,
              ...(apply ? ["--apply"] : []),
            ],
            cwd,
            true,
            signal,
            timeoutMs,
          );
          break;
        case "verify_public":
          await this.executeStep(
            steps,
            "verify public release",
            ["npm", "run", "--silent", "release:verify-public", "--", "--version", version],
            cwd,
            true,
            signal,
            timeoutMs,
          );
          break;
        default:
          throw new Error(
            `Unsupported ts-quality release workflow action: ${action satisfies never}`,
          );
      }

      const result: TsQualityReleaseWorkflowResult = {
        ok: true,
        action,
        cwd,
        version,
        tag,
        applied: apply,
        externalMutationApproved,
        steps,
        nextStep: "",
      };
      result.nextStep = describeTsQualityReleaseNextStep(result);
      return result;
    } catch (error) {
      const result: TsQualityReleaseWorkflowResult = {
        ok: false,
        action,
        cwd,
        version,
        tag,
        applied: apply,
        externalMutationApproved,
        steps,
        nextStep: "",
        error: error instanceof Error ? error.message : String(error),
      };
      result.nextStep = describeTsQualityReleaseNextStep(result);
      return result;
    }
  }

  private async executeStep(
    steps: TsQualityReleaseWorkflowStep[],
    name: string,
    command: string[],
    cwd: string,
    execute: boolean,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<void> {
    if (!execute) {
      steps.push(plannedStep(name, command));
      return;
    }

    const [bin, ...args] = command;
    if (!bin) {
      throw new Error(`Invalid empty command for release workflow step: ${name}`);
    }

    const result = await execFileTextAsync(bin, args, { cwd, signal, timeoutMs });
    if (isBoundaryFailure(result)) {
      steps.push({
        name,
        command,
        status: "failed",
        stderr: result.stderr,
        stdout: result.stdout,
        exitCode: result.exitCode,
        error: result.error,
      });
      throw new Error(`${name} failed: ${result.error}`);
    }

    steps.push({
      name,
      command,
      status: "done",
      stdout: result.value.trim(),
    });
  }
}

export function formatTsQualityReleaseWorkflowResult(
  result: TsQualityReleaseWorkflowResult,
): string {
  const lines = [
    `ts-quality release workflow — ${result.action} — ${result.ok ? "ok" : "failed"}`,
    `CWD: ${result.cwd}`,
    `Version: ${result.version}`,
    `Tag: ${result.tag}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    `External mutation approved: ${result.externalMutationApproved ? "yes" : "no"}`,
    `Next step: ${result.nextStep}`,
    "",
    "## Steps",
  ];

  for (const step of result.steps) {
    lines.push(`- ${step.status}: ${step.name} — \`${commandText(step.command)}\``);
    if (step.error) {
      lines.push(`  - error: ${step.error}`);
    }
    if (step.stdout) {
      lines.push(`  - stdout: ${step.stdout.slice(0, 1200)}`);
    }
    if (step.stderr) {
      lines.push(`  - stderr: ${step.stderr.slice(0, 1200)}`);
    }
  }

  if (result.error) {
    lines.push("", `Error: ${result.error}`);
  }

  return lines.join("\n");
}
