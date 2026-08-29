/**
summary: "Vent store retention candidates, archive, history, restore, and fail-closed guards; split from vent-store.test.js."
read_when:
  - "You change retention candidates, archive, history, restore, and fail-closed guards behavior."
*/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendReviewEvent,
  appendVentRecord,
  archiveRecurrenceGroup,
  buildRetentionCandidates,
  buildRetentionHistory,
  buildRetentionPreview,
  createReviewEvent,
  createVentRecord,
  formatRetentionCandidates,
  formatRetentionHistory,
  loadDiagnosticState,
  readRetentionEvents,
  readVentRecords,
  restoreRetentionBackup,
} from "../src/vent-store.js";

test("retention candidates list reviewed groups without tokens or mutation", () => {
  const fresh = createVentRecord({
    summary: "Fresh retention group",
    category: "workflow",
    recurrenceKey: "fresh-retention",
  });
  const acknowledged = createVentRecord({
    summary: "Acknowledged retention group token=abc123",
    category: "tool_failure",
    recurrenceKey: "ack-retention",
    tags: ["Retention"],
    tool: "pi reload",
    packageName: "@tryinget/pi-agent-vent",
  });
  const dismissed = createVentRecord({
    summary: "Dismissed retention group",
    category: "documentation",
    recurrenceKey: "dismissed-retention",
    tags: ["Retention"],
  });
  const reviews = [
    createReviewEvent({
      recurrenceKey: acknowledged.recurrenceKey,
      state: "acknowledged",
      note: "reviewed token=abc123 locally",
    }),
    createReviewEvent({ recurrenceKey: dismissed.recurrenceKey, state: "dismissed" }),
  ];

  const candidates = buildRetentionCandidates({
    records: [fresh, acknowledged, dismissed],
    reviewEvents: reviews,
    filters: { tags: ["retention"], tool: "pi reload" },
    limit: 10,
    now: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(candidates.stateFilter, "reviewed");
  assert.equal(candidates.groupCount, 3);
  assert.equal(candidates.matchingGroupCount, 1);
  assert.equal(candidates.candidateCount, 1);
  assert.equal(candidates.items[0].reviewState, "acknowledged");
  assert.equal(candidates.filters.tool, "pi-reload");

  const text = formatRetentionCandidates(candidates);
  assert.match(text, /Agent vent retention candidates/);
  assert.match(text, /read-only planning view/);
  assert.match(text, /preview to request archive token: \/agent_vent retention preview/);
  assert.match(text, /reviewed token=\[REDACTED\] locally/);
  assert.match(
    text,
    /export this outcome bucket: \/agent_vent export markdown acknowledged tool=pi-reload tag=retention/,
  );
  assert.match(text, /No archive, restore, AK task, GitHub issue, incident, evidence/);
  assert.match(text, /not owner routing/);
  assert.doesNotMatch(text, /archive:[a-f0-9]/);
  assert.doesNotMatch(text, /abc123|was archived|was filed|owner was assigned/);

  const allCandidates = buildRetentionCandidates({
    records: [fresh, acknowledged],
    reviewEvents: reviews,
    state: "all",
  });
  assert.equal(allCandidates.candidateCount, 2);
  assert.match(formatRetentionCandidates(allCandidates), /review before archive/);
  assert.throws(
    () => buildRetentionCandidates({ records: [], reviewEvents: [], state: "resolved" }),
    /invalid agent_vent review state/,
  );
  assert.throws(
    () => buildRetentionCandidates({ filters: { category: "../../etc/passwd" } }),
    /invalid agent_vent review filter category/,
  );
});

test("retention archive is confirmation-gated, backed up, receipted, and restorable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const keep = createVentRecord(
    { summary: "Keep active", category: "workflow", recurrenceKey: "keep" },
    { id: "keep" },
  );
  const archive = createVentRecord(
    { summary: "Archive reviewed", category: "workflow", recurrenceKey: "archive-me" },
    { id: "archive" },
  );
  appendVentRecord(storePath, keep);
  appendVentRecord(storePath, archive);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({
      recurrenceKey: archive.recurrenceKey,
      state: "dismissed",
      note: "reviewed token=abc123",
    }),
  );

  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  assert.throws(
    () =>
      buildRetentionPreview({
        recurrenceKey: archive.recurrenceKey,
        records: state.records,
        reviewEvents: state.reviewEvents,
        storeHash: state.ventsHash,
      }),
    /requires current store, review, and curation hashes/,
  );
  const preview = buildRetentionPreview({
    recurrenceKey: archive.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  assert.equal(preview.archivable, true);
  assert.equal(preview.archivedRecordCount, 1);
  assert.match(preview.confirmationToken, /^archive:/);
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: archive.recurrenceKey,
        confirmationToken: "archive:wrong",
      }),
    /requires exact confirmation token/,
  );

  const result = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: archive.recurrenceKey,
    confirmationToken: preview.confirmationToken,
    note: "archive note password=hunter2",
  });
  assert.equal(readVentRecords(storePath).records.length, 1);
  assert.equal(readVentRecords(storePath).records[0].id, "keep");
  assert.equal(fs.existsSync(result.backupPath), true);
  assert.match(result.restoreConfirmationToken, /^restore:/);
  const retentionEvents = readRetentionEvents(retentionPath).events;
  assert.equal(retentionEvents.length, 1);
  assert.equal(retentionEvents[0].action, "archive");
  assert.match(retentionEvents[0].note, /password=\[REDACTED\]/);
  assert.match(result.boundary, /No AK task, GitHub issue, incident, evidence/);

  const restore = restoreRetentionBackup({
    storePath,
    retentionPath,
    backupDir,
    backupPath: result.backupPath,
    confirmationToken: result.restoreConfirmationToken,
  });
  assert.equal(restore.restoredRecordCount, 1);
  assert.equal(readVentRecords(storePath).records.length, 2);
  assert.equal(readRetentionEvents(retentionPath).events.length, 2);
});

test("retention history reconstructs restore candidates without trusting escaped receipt paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent vent retention history-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "History archive", category: "workflow", recurrenceKey: "history archive" },
    { id: "history" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" }),
  );

  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    curationEvents: state.curationEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  const archived = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: record.recurrenceKey,
    confirmationToken: preview.confirmationToken,
  });
  const events = readRetentionEvents(retentionPath).events;
  const history = buildRetentionHistory({ retentionEvents: events, backupDir, limit: 5 });

  assert.equal(history.totalEvents, 1);
  assert.match(history.items[0].restoreConfirmationToken, /^restore:/);
  assert.equal(history.items[0].restoreConfirmationToken, archived.restoreConfirmationToken);
  assert.match(history.items[0].restoreCommand, /retention restore/);
  assert.match(history.items[0].restoreCommand, /".*history-archive.*\.agent-vent-backup\.json"/);
  const text = formatRetentionHistory(history);
  assert.match(text, /read-only receipt projection/i);
  assert.match(text, /rollback candidate: \/agent_vent retention restore/);
  assert.match(text, /stale\/moved\/path-invalid backups fail closed/);
  assert.doesNotMatch(
    text,
    /AK task was created|GitHub issue was created|incident was declared|evidence was recorded|owner was assigned/,
  );

  const escaped = buildRetentionHistory({
    retentionEvents: [
      {
        ...events[0],
        id: "evil-receipt",
        backupPath: path.join(dir, "outside.agent-vent-backup.json"),
      },
    ],
    backupDir,
  });
  assert.equal(escaped.items[0].restoreCommand, undefined);
  assert.match(
    escaped.items[0].restoreUnavailableReason,
    /outside the configured backup directory/,
  );
});

test("retention archive removes only selected group records when legacy ids collide", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-duplicate-id-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const archive = createVentRecord(
    { summary: "Archive duplicate id", category: "bug", recurrenceKey: "archive-duplicate" },
    { id: "duplicate-id" },
  );
  const keep = createVentRecord(
    { summary: "Keep duplicate id", category: "workflow", recurrenceKey: "keep-duplicate" },
    { id: "duplicate-id" },
  );
  appendVentRecord(storePath, archive);
  appendVentRecord(storePath, keep);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: archive.recurrenceKey, state: "acknowledged" }),
  );

  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: archive.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: archive.recurrenceKey,
    confirmationToken: preview.confirmationToken,
  });

  const remaining = readVentRecords(storePath).records;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].recurrenceKey, keep.recurrenceKey);
  assert.equal(remaining[0].id, "duplicate-id");
});

test("retention fails closed for unreviewed groups, path escape, and stale restore", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-negative-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Needs lifecycle", category: "bug", recurrenceKey: "needs-lifecycle" },
    { id: "v1" },
  );
  appendVentRecord(storePath, record);
  const unreviewed = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: unreviewed.records,
    reviewEvents: unreviewed.reviewEvents,
    storeHash: unreviewed.ventsHash,
    reviewHash: unreviewed.reviewEventsHash,
    curationHash: unreviewed.curationEventsHash,
  });
  assert.equal(preview.archivable, false);
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /before local review/,
  );

  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" }),
  );
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /requires exact confirmation token/,
  );
  const reviewed = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const token = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: reviewed.records,
    reviewEvents: reviewed.reviewEvents,
    storeHash: reviewed.ventsHash,
    reviewHash: reviewed.reviewEventsHash,
    curationHash: reviewed.curationEventsHash,
  }).confirmationToken;
  const archived = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: record.recurrenceKey,
    confirmationToken: token,
  });

  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: path.join(dir, "outside.agent-vent-backup.json"),
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /backup path must stay inside/,
  );
  appendVentRecord(
    storePath,
    createVentRecord({ summary: "New record after archive", category: "bug" }, { id: "new" }),
  );
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: archived.backupPath,
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /stale backup/,
  );
});

test("retention archive rejects stale confirmation when active store changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-stale-token-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Archive target", category: "bug", recurrenceKey: "target" },
    { id: "target" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "acknowledged" }),
  );
  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const preview = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  });
  appendVentRecord(
    storePath,
    createVentRecord({ summary: "Concurrent new record", category: "bug" }, { id: "new" }),
  );
  assert.throws(
    () =>
      archiveRecurrenceGroup({
        storePath,
        reviewPath,
        retentionPath,
        backupDir,
        recurrenceKey: record.recurrenceKey,
        confirmationToken: preview.confirmationToken,
      }),
    /requires exact confirmation token/,
  );
  assert.deepEqual(
    readVentRecords(storePath)
      .records.map((entry) => entry.id)
      .sort(),
    ["new", "target"],
  );
});

test("retention archive rolls active store back when receipt append fails", (context) => {
  if (process.getuid?.() === 0) {
    context.skip("root can bypass file write permissions");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-receipt-fail-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    { summary: "Receipt failure target", category: "bug", recurrenceKey: "receipt-fail" },
    { id: "target" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "dismissed" }),
  );
  fs.writeFileSync(retentionPath, "", "utf8");
  fs.chmodSync(retentionPath, 0o400);
  try {
    const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
    const token = buildRetentionPreview({
      recurrenceKey: record.recurrenceKey,
      records: state.records,
      reviewEvents: state.reviewEvents,
      storeHash: state.ventsHash,
      reviewHash: state.reviewEventsHash,
      curationHash: state.curationEventsHash,
    }).confirmationToken;
    assert.throws(
      () =>
        archiveRecurrenceGroup({
          storePath,
          reviewPath,
          retentionPath,
          backupDir,
          recurrenceKey: record.recurrenceKey,
          confirmationToken: token,
        }),
      /EACCES|EPERM|permission/i,
    );
    assert.equal(readVentRecords(storePath).records.length, 1);
    assert.equal(fs.readdirSync(backupDir).length, 0);
  } finally {
    fs.chmodSync(retentionPath, 0o600);
  }
});

test("retention restore rejects symlinked backup directories and tampered restore tokens", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-symlink-backup-"));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-external-"));
  const storePath = path.join(dir, "vents.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const current = createVentRecord({ summary: "Current", category: "bug" }, { id: "current" });
  const injectedJsonl = `${JSON.stringify(createVentRecord({ summary: "Injected", category: "bug" }, { id: "injected" }))}\n`;
  appendVentRecord(storePath, current);
  const currentText = fs.readFileSync(storePath, "utf8");
  const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  const backup = {
    schemaVersion: 1,
    artifactType: "agent_vent_retention_backup",
    recurrenceKey: "bug:crafted",
    beforeHash: hash(injectedJsonl),
    afterHash: hash(currentText),
    restoreConfirmationToken: "restore:not-derived",
    ventsJsonl: injectedJsonl,
  };
  fs.writeFileSync(
    path.join(externalDir, "crafted.agent-vent-backup.json"),
    JSON.stringify(backup),
  );
  fs.symlinkSync(externalDir, backupDir);
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: path.join(backupDir, "crafted.agent-vent-backup.json"),
        confirmationToken: "restore:not-derived",
      }),
    /backup directory must be a real directory/,
  );
  fs.rmSync(backupDir);
  fs.mkdirSync(backupDir);
  const localBackupPath = path.join(backupDir, "crafted.agent-vent-backup.json");
  fs.writeFileSync(localBackupPath, JSON.stringify(backup));
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: localBackupPath,
        confirmationToken: "restore:not-derived",
      }),
    /restore token failed integrity check/,
  );
});

test("retention restore fails closed when current store is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-retention-missing-"));
  const storePath = path.join(dir, "vents.jsonl");
  const reviewPath = path.join(dir, "review-events.jsonl");
  const retentionPath = path.join(dir, "retention-events.jsonl");
  const backupDir = path.join(dir, "backups");
  const record = createVentRecord(
    {
      summary: "Archive then remove active store",
      category: "bug",
      recurrenceKey: "missing-store",
    },
    { id: "missing" },
  );
  appendVentRecord(storePath, record);
  appendReviewEvent(
    reviewPath,
    createReviewEvent({ recurrenceKey: record.recurrenceKey, state: "dismissed" }),
  );
  const state = loadDiagnosticState({ storePath, reviewPath, retentionPath, backupDir });
  const token = buildRetentionPreview({
    recurrenceKey: record.recurrenceKey,
    records: state.records,
    reviewEvents: state.reviewEvents,
    storeHash: state.ventsHash,
    reviewHash: state.reviewEventsHash,
    curationHash: state.curationEventsHash,
  }).confirmationToken;
  const archived = archiveRecurrenceGroup({
    storePath,
    reviewPath,
    retentionPath,
    backupDir,
    recurrenceKey: record.recurrenceKey,
    confirmationToken: token,
  });
  fs.rmSync(storePath);
  assert.throws(
    () =>
      restoreRetentionBackup({
        storePath,
        retentionPath,
        backupDir,
        backupPath: archived.backupPath,
        confirmationToken: archived.restoreConfirmationToken,
      }),
    /requires current vents store/,
  );
});

test("record requires non-empty summary", () => {
  assert.throws(() => createVentRecord({ summary: "   " }), /requires a non-empty summary/);
});
