export default function customCompaction(pi) {
  pi.on('session_before_compact', async ({ preparation: p, signal }, ctx) => {
    try {
      const content = JSON.stringify({ previous: p.previousSummary,
        history: p.messagesToSummarize, prefix: p.turnPrefixMessages });
      const result = await ctx.modelRegistry.complete(ctx.model, {
        systemPrompt: 'Write a self-contained checkpoint: objective, progress, next steps.',
        messages: [{ role: 'user', content, timestamp: Date.now() }],
      }, { signal, maxTokens: p.settings.reserveTokens });
      if (signal.aborted || result.stopReason === 'aborted') return { cancel: true };
      if (result.stopReason === 'error') throw new Error(result.errorMessage);
      const summary = result.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      return { compaction: { summary, firstKeptEntryId: p.firstKeptEntryId,
        tokensBefore: p.tokensBefore } };
    } catch (error) {
      if (signal.aborted) return { cancel: true };
      throw error;
    }
  });
}
