import { createError, FsaErrorCode } from './error';
import type { PathLike } from './types';

export const pathLikeToString = (path: PathLike) => {
  if (typeof path === 'string') return path;
  if (path instanceof URL) {
    if (path.protocol !== 'file:') {
      throw createError(FsaErrorCode.ENOENT, path, 'open');
    }
    return path.pathname;
  }
  return path.toString();
};

export const splitPath = (pathLike: PathLike) => {
  const path = pathLikeToString(pathLike);
  if (!path) return [];
  const paths = path.split(/[/\\]/);
  const result: string[] = [];
  for (const path of paths) {
    if (!path || path === '.') continue;
    if (path === '..') {
      if (!result.length) {
        throw createError(FsaErrorCode.ENOENT, pathLike, 'open');
      }
      result.pop();
      continue;
    }
    result.push(path);
  }
  return result;
};

export const pathsToDirsAndFilename = (paths: string[]) => {
  const filename = paths[paths.length - 1];
  if (!filename) {
    throw createError(FsaErrorCode.ENOENT, joinPaths(paths), 'open');
  }
  return {
    dirs: paths.slice(0, -1),
    filename,
  };
};

export const splitPathToDirsAndFilename = (path: PathLike) => pathsToDirsAndFilename(splitPath(path));

export const joinPaths = (paths: string[]) => paths.join('/');
