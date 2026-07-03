import type { PathLike } from './types';

export enum FsaErrorCode {
  ENOENT = 'ENOENT',
  EEXIST = 'EEXIST',
  EPERM = 'EPERM',
  ENOTEMPTY = 'ENOTEMPTY',
  EISDIR = 'EISDIR',
  ENOTDIR = 'ENOTDIR',
  EINVAL = 'EINVAL',
}

const errorMsgMap: Record<FsaErrorCode, string> = {
  [FsaErrorCode.ENOENT]: 'no such file or directory',
  [FsaErrorCode.EEXIST]: 'file already exists',
  [FsaErrorCode.EPERM]: 'operation not permitted',
  [FsaErrorCode.ENOTEMPTY]: 'directory not empty',
  [FsaErrorCode.EISDIR]: 'illegal operation on a directory',
  [FsaErrorCode.ENOTDIR]: 'not a directory',
  [FsaErrorCode.EINVAL]: 'invalid argument',
};

const errnoMap: Record<FsaErrorCode, number> = {
  [FsaErrorCode.ENOENT]: -2,
  [FsaErrorCode.EEXIST]: -17,
  [FsaErrorCode.EPERM]: -1,
  [FsaErrorCode.ENOTEMPTY]: -66,
  [FsaErrorCode.EISDIR]: -21,
  [FsaErrorCode.ENOTDIR]: -20,
  [FsaErrorCode.EINVAL]: -22,
};

export class FsaError extends Error {
  readonly errno: number;

  constructor(
    message: string,
    readonly code: string,
    readonly syscall: string,
    readonly path: string,
    cause?: any,
  ) {
    super(message, { cause });
    this.errno = errnoMap[code as FsaErrorCode];
  }
}

/**
 * Builds a Node-compatible `FsaError`.
 *
 * The message format mirrors Node: `CODE: <msg>, <syscall> '<path>'`.
 * When `includePath` is `false` the path is omitted (e.g. `readFile` on a
 * directory yields `EISDIR: illegal operation on a directory, read`).
 */
export const createError = (
  code: FsaErrorCode,
  path: PathLike,
  syscall: string,
  cause?: any,
  includePath = true,
) => {
  const pathStr = String(path);
  const base = `${code}: ${errorMsgMap[code]}, ${syscall}`;
  const message = includePath ? `${base} '${pathStr}'` : base;
  return new FsaError(message, code, syscall, pathStr, cause);
};
