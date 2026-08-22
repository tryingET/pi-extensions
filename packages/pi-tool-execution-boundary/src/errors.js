export class BoundaryError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = "BoundaryError";
    this.code = code;
    this.details = details;
  }
}

export function boundaryAssert(condition, code, message, details = undefined) {
  if (!condition) throw new BoundaryError(code, message, details);
}
