import type { ExecutionResult } from "../types/intents";

interface WaitEntry {
  promise: Promise<ExecutionResult>;
  resolve: (value: ExecutionResult) => void;
  reject: (error: unknown) => void;
}

const waiters = new Map<string, WaitEntry>();

export function hasExecutionWaiter(executionId: string): boolean {
  return waiters.has(executionId);
}

export function getExecutionWaiter(executionId: string): Promise<ExecutionResult> | null {
  return waiters.get(executionId)?.promise ?? null;
}

export function registerExecutionWaiter(executionId: string): Promise<ExecutionResult> {
  const existing = waiters.get(executionId);
  if (existing) {
    return existing.promise;
  }

  let resolve!: (value: ExecutionResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ExecutionResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  waiters.set(executionId, { promise, resolve, reject });
  return promise;
}

export function resolveExecutionWaiter(executionId: string, result: ExecutionResult): void {
  const entry = waiters.get(executionId);
  if (!entry) {
    return;
  }
  entry.resolve(result);
}

export function rejectExecutionWaiter(executionId: string, error: unknown): void {
  const entry = waiters.get(executionId);
  if (!entry) {
    return;
  }
  entry.reject(error);
}

export function clearExecutionWaiter(executionId: string): void {
  waiters.delete(executionId);
}
