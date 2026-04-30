export default [
  {
    kind: 'risk',
    id: 'provenance-runtime-evidence-risk',
    paths: ['packages/pi-provenance/src/**'],
    message: 'Pi provenance source changes require explicit execution evidence because they shape downstream evidence artifacts.',
    maxCrap: 40,
    minMutationScore: 0,
    minMergeConfidence: 0
  },
  {
    kind: 'boundary',
    id: 'provenance-no-session-content-leak',
    from: ['packages/pi-provenance/src/**'],
    to: ['packages/pi-provenance/extensions/**'],
    mode: 'allow',
    message: 'The package-local extension may call the source-owned provenance core, but provenance artifacts must not copy raw assistant content.'
  }
];
