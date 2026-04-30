export default [{
  id: 'release-bot',
  kind: 'automation',
  roles: ['ci'],
  grants: [{
    id: 'release-bot-pi-provenance-merge',
    actions: ['merge'],
    paths: ['packages/pi-provenance/src/**'],
    minMergeConfidence: 70
  }]
}];
