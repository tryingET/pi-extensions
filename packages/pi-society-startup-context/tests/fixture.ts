import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotConfig } from "../src/config.ts";

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "society-reliability-"));
  const repo = join(root, "ai-society", "repo");
  const executable = join(root, "reader.cjs");
  const log = join(root, "calls.jsonl");
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, "README.md"), "fixture\n");
  execFileSync("git", ["init", "--quiet"], { cwd: repo });
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "maintenance.auto=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: repo },
  );
  writeFileSync(
    executable,
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const surface = args.slice(0,2).join('.');
const kinds = {'repo.resolve':'repo_resolution','startup.snapshot':'startup_snapshot','direction.export':'direction_graph','direction.check':'direction_check_report','decision.list':'decision_collection','decision.passport':'decision_passport'};
const repo = ${JSON.stringify(repo)};
const log = ${JSON.stringify(log)};
const row = {id:7,title:'Open decision',state:'in_review',repo_scope:repo,outcome:null};
const defaults = {
 'repo.resolve':{input:args[2],registered:true,canonical_path:repo,repo:{path:repo}},
 'startup.snapshot':{schema_version:40,repo_scope:repo,task_status_counts:{claimed:1,pending:2},ready_task_count:1,ready_sample:[{id:42,title:'Ready',priority:1}],active_deferral_count:0,expired_lease_count:0,generated_at:'2026-10-01T00:00:00Z'},
 'direction.export':{nodes:[{key:'sf.1',title:'Direction',state:'active'}]},
 'direction.check':{repo_scope:repo,checked_at:'2026-10-01T00:00:00Z',ok:true,imported_node_count:1,parsed_node_count:1,issues:[]},
 'decision.list':{count:0,decisions:[]},
 'decision.passport':{decision:row,linked_tasks:[],artifacts:[],artifact_statuses:[],readiness_checks:[]}
};
const override = JSON.parse(process.env.SOCIETY_FIXTURE_RESPONSES || '{}')[surface] || {};
const entry = {surface,args,pid:process.pid,akDb:process.env.AK_DB ?? null};
fs.appendFileSync(log,JSON.stringify({...entry,phase:'start'})+'\\n');
const lock = ${JSON.stringify(join(root, "active"))};
try { fs.mkdirSync(lock); } catch { fs.appendFileSync(log,JSON.stringify({...entry,phase:'overlap'})+'\\n'); }
process.on('exit',()=>{try{fs.rmdirSync(lock);}catch{} fs.appendFileSync(log,JSON.stringify({...entry,phase:'end'})+'\\n');});
process.on('SIGTERM',()=>process.exit(143));
if (override.hang) setInterval(()=>{},1000);
else setTimeout(()=>{
 if (override.raw !== undefined) process.stdout.write(override.raw);
 else process.stdout.write(JSON.stringify({surface,schema_version:1,payload_kind:kinds[surface],ok:true,payload:override.payload || defaults[surface],...override.envelope}));
 process.exitCode=override.exit || 0;
},override.delay || 0);
`,
  );
  chmodSync(executable, 0o755);
  return {
    root,
    repo,
    executable,
    config: (responses: Record<string, unknown> = {}, extra: NodeJS.ProcessEnv = {}) =>
      snapshotConfig(repo, {
        ...process.env,
        AK_DB: undefined,
        HOME: root,
        PI_SOCIETY_CONTEXT_AK: executable,
        SOCIETY_FIXTURE_RESPONSES: JSON.stringify(responses),
        ...extra,
      }),
    calls: () =>
      readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as {
              phase: string;
              surface: string;
              args: string[];
              akDb: string | null;
            },
        ),
    clear: () => writeFileSync(log, ""),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
