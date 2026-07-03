import { Buffer } from 'buffer/';
import { afterEach, beforeEach, expect } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaError } from '../../src';

(globalThis.navigator as any).storage = {
  getDirectory: () => showDirectoryPicker({ mode: 'readwrite' }),
};

/**
 * Installs the fsa-mock file system before each test and uninstalls it after.
 * Call once at the top of every describe block that touches the file system.
 */
export const useMockFs = () => {
  beforeEach(() => mock.install());
  afterEach(() => mock.uninstall());
};

export const CONTENT = 'hello word';
export const CONTENT_BUFFER = Buffer.from(CONTENT);

export const expectSameBuffer = (a: Buffer, b: Buffer) => expect(a.compare(b)).toBe(0);

export interface ExpectedFsError {
  code: string;
  syscall?: string;
  message?: string;
}

/**
 * Asserts that a promise rejects with a `FsaError` matching the expected
 * `code` (and optionally `syscall` / exact `message`).
 */
export const expectFsError = async (promise: Promise<unknown>, expected: ExpectedFsError) => {
  let error: any;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(FsaError);
  expect(error.code).toBe(expected.code);
  if (expected.syscall !== undefined) expect(error.syscall).toBe(expected.syscall);
  if (expected.message !== undefined) expect(error.message).toBe(expected.message);
  return error as FsaError;
};
