import { compareUtf8, invariant, sha256Digest } from "./source-selection-experiment-utils.js";

const LABEL_TOKENS = new Set(["case", "example", "number", "question", "scenario"]);

export function normalizedIntentTokens(question) {
  const tokens =
    String(question)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  return [
    ...new Set(tokens.filter((token) => !/\d/.test(token) && !LABEL_TOKENS.has(token))),
  ].sort();
}

export function expectedQuestionIdentity(item, repository) {
  const tokens = normalizedIntentTokens(item.question);
  invariant(tokens.length > 0, `${item.id}: question has no normalized intent tokens`);
  const intentSignature = sha256Digest(tokens);
  const targetBasisDigest = sha256Digest({
    repositoryCommit: repository.commit,
    sourceListArtifactSha256: repository.rawArtifactSha256,
    truth: [...item.truth].sort(compareUtf8),
  });
  const questionId = `question:${sha256Digest({
    repositoryId: item.repositoryId,
    intentSignature,
    targetBasisDigest,
  })}`;
  return { questionId, intentSignature, targetBasisDigest };
}

export function validateQuestionIdentity(item, repository) {
  const expected = expectedQuestionIdentity(item, repository);
  invariant(
    item.intentSignature === expected.intentSignature,
    `${item.id}: intentSignature mismatch`,
  );
  invariant(
    item.targetBasisDigest === expected.targetBasisDigest,
    `${item.id}: targetBasisDigest mismatch`,
  );
  invariant(item.questionId === expected.questionId, `${item.id}: questionId mismatch`);
  return expected;
}
