export default [{
  id: 'pi.provenance.assistant-message-minimality',
  title: 'Pi assistant message provenance stays minimal and source-owned',
  description: 'The pi-provenance package must extract provider/model/api/session identity without copying assistant message content into provenance artifacts.',
  severity: 'high',
  selectors: ['path:packages/pi-provenance/src/provenance-core.js', 'symbol:buildAssistantMessageProvenance'],
  requiredTestPatterns: ['packages/pi-provenance/tests/provenance-core.test.mjs'],
  scenarios: [{
    id: 'minimal-fields-no-content',
    description: 'assistant provenance copies minimal provenance fields and omits message content',
    keywords: ['copies only minimal provenance fields', 'content'],
    failurePathKeywords: ['missing provider, model, or api'],
    expected: 'omit-content'
  }]
}];
