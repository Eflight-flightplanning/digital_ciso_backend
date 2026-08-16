export function reportLovableError(error: Error | unknown, context?: Record<string, any>): void {
  if (typeof console !== "undefined") {
    console.error("[Lovable Error Boundary]:", error, context);
  }
}