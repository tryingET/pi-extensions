export type CandidateArchiveReceipt = {
  archiveDir: string;
  archiveDigest: string;
  verifiedAt: string;
  restorationDigest: string;
  manifest: Record<string, string>;
};

export type CandidateCleanupEffect = "remove_worktree" | "delete_branch";

export type CandidateCleanupAuthorization = {
  schemaVersion: 2;
  resourceId: string;
  generationId: string;
  authorizedResourceVersion: number;
  aliases: string[];
  actor: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  dispositionDigest: string;
  reviewSnapshotDigest: string;
  integrationProofDigest?: string;
  targetOid?: string;
  archiveDigest: string;
  expectedWorktreeRealPath: string;
  expectedGitCommonDir: string;
  branchName: string;
  branchOid: string;
  reissuedFromAuthorizationDigest?: string;
  effects: CandidateCleanupEffect[];
  authorizationDigest: string;
};
