/**
 * Complete one summary request through Pi's live host model registry.
 *
 * The host owns provider registration, authentication, protocol dispatch, and
 * custom stream overrides. The compaction extension deliberately does not
 * import pi-ai or maintain a second provider registry.
 */
export async function completeWithHostModelRegistry(ctx, model, context, options = {}) {
  const completeSimple = ctx?.modelRegistry?.completeSimple;
  if (typeof completeSimple !== "function") {
    throw new Error(
      "Pi host model registry does not expose completeSimple; update the Pi host before enabling custom compaction",
    );
  }
  return completeSimple.call(ctx.modelRegistry, model, context, options);
}
