let lastCapturedError: Error | null = null;

export function captureError(error: Error | unknown): void {
  if (error instanceof Error) {
    lastCapturedError = error;
  } else {
    lastCapturedError = new Error(String(error));
  }
}

export function consumeLastCapturedError(): Error | null {
  const err = lastCapturedError;
  lastCapturedError = null;
  return err;
}

if (typeof process !== "undefined" && process.on) {
  process.on("unhandledRejection", (reason) => {
    captureError(reason);
  });
  process.on("uncaughtException", (error) => {
    captureError(error);
  });
}