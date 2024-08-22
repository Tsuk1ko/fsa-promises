import type { PathLike } from './types';

export class FsaError extends Error {
  constructor(message: string, public readonly code: string, public readonly syscall: string, public readonly path: string, cause?: any) {
    super(`${code}: ${message}`, { cause });
  }
}

export enum FsaErrorCode {
  ENOENT = 'ENOENT',
  EEXIST = 'EEXIST',
  EPERM = 'EPERM',
  ENOTEMPTY = 'ENOTEMPTY',
}

const errorMsgMap: Record<FsaErrorCode, string> = {
  [FsaErrorCode.ENOENT]: 'no such file or directory',
  [FsaErrorCode.EEXIST]: 'file already exists',
  [FsaErrorCode.EPERM]: 'operation not permitted',
  [FsaErrorCode.ENOTEMPTY]: 'directory not empty',
};

export const createError = (code: FsaErrorCode, path: PathLike, syscall: string, cause?: any) =>
  new FsaError(`${errorMsgMap[code]}, ${syscall} '${path}'`, code, syscall, String(path), cause);
