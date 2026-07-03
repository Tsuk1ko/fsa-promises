import { Buffer } from 'buffer/';
import { Dirent } from './dirent';
import { createError, FsaError, FsaErrorCode } from './error';
import { FileType } from './internalTypes';
import { joinPaths, pathsToDirsAndFilename, splitPath, splitPathToDirsAndFilename } from './path';
import { BigIntStats, Stats } from './stat';
import { decodeBuffer, encodeString } from './textCoder';
import type { Abortable, BufferEncoding, ObjectEncodingOptions, OpenMode, PathLike } from './types';

export interface FsaPromisesOptions {
  /** File system root */
  root?: string | FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>;
  /** When it is `true`, the library will use `createSyncAccessHandle()` instead of `createWritable()` to write file. */
  useSyncAccessHandleForFile?: boolean;
  /** Whether to enable dir handle cache */
  cacheDirHandle?: boolean;
}

export type FsaPromisesWriteFileOptions =
  | (ObjectEncodingOptions & Abortable & { flag?: OpenMode; flush?: boolean; ensureDir?: boolean })
  | BufferEncoding
  | null;

interface DirCacheNode {
  handle: Promise<FileSystemDirectoryHandle>;
  children: DirCache;
  create: boolean;
}

type DirCache = Map<string, DirCacheNode>;

interface GetDirHandleByPathOptions {
  path: PathLike;
  options?: FileSystemGetDirectoryOptions;
  rootHandle?: Promise<FileSystemDirectoryHandle>;
  syscall?: string;
  bypassCache?: boolean;
}

interface GetDirHandleByPathsOptions {
  paths: string[];
  path?: PathLike;
  options?: FileSystemGetDirectoryOptions;
  rootHandle?: Promise<FileSystemDirectoryHandle>;
  output?: GetDirHandleByPathsOutput;
  syscall?: string;
  bypassCache?: boolean;
}

interface GetDirHandleByPathsOutput {
  dirCache?: DirCache;
}

interface GetFileHandleByPathOptions {
  path: PathLike;
  options?: FileSystemGetDirectoryOptions;
  ensureDir?: boolean;
  syscall?: string;
}

interface GetFileHandleByPathsOptions {
  paths: string[];
  options?: FileSystemGetFileOptions;
  path?: PathLike;
  ensureDir?: boolean;
  syscall?: string;
}

export class FsaPromises {
  private readonly rootHandle: Promise<FileSystemDirectoryHandle>;

  private readonly useSyncAccessHandleForFile: boolean;

  private readonly dirCache?: DirCache;

  constructor(options?: FsaPromisesOptions | FsaPromisesOptions['root']) {
    const {
      root = '',
      useSyncAccessHandleForFile = false,
      cacheDirHandle = false,
    } = typeof options === 'string' ||
    options instanceof FileSystemDirectoryHandle ||
    options instanceof Promise
      ? { root: options }
      : options || {};
    this.useSyncAccessHandleForFile = useSyncAccessHandleForFile;
    if (cacheDirHandle) this.dirCache = new Map();
    if (typeof root === 'string') {
      this.rootHandle = this.getDirHandleByPath({
        path: root,
        options: { create: true },
        rootHandle: navigator.storage.getDirectory(),
        bypassCache: true,
      });
    } else this.rootHandle = Promise.resolve(root);
  }

  readFile(path: PathLike, options?: { encoding?: null } | null): Promise<Buffer>;
  readFile(path: PathLike, options: { encoding: BufferEncoding } | BufferEncoding): Promise<string>;
  async readFile(
    path: PathLike,
    options?: ObjectEncodingOptions | BufferEncoding | null,
  ): Promise<string | Buffer> {
    const { encoding } = this.normalizeOptions(options);
    let handle: FileSystemFileHandle;
    try {
      handle = await this.getFileHandleByPath({ path, syscall: 'open' });
    } catch (e) {
      if (e instanceof FsaError && e.code === FsaErrorCode.EISDIR) {
        throw createError(FsaErrorCode.EISDIR, path, 'read', e.cause, false);
      }
      throw e;
    }
    const content = await (await handle.getFile()).arrayBuffer();
    if (encoding) return decodeBuffer(content, encoding);
    return Buffer.from(content);
  }

  async writeFile(
    path: PathLike,
    data: Buffer | ArrayBuffer | ArrayBufferView<ArrayBuffer> | Blob | string,
    options?: FsaPromisesWriteFileOptions,
  ): Promise<void> {
    const { encoding, signal, flag, flush, ensureDir } = this.normalizeOptions(options);
    if (typeof flag === 'number') throw new Error('Not implemented: number flag');
    signal?.throwIfAborted();
    const isAppend = flag?.includes('a');
    const failsWhenExist = flag?.includes('x');
    if (failsWhenExist && (await this.exists(path))) {
      throw createError(FsaErrorCode.EEXIST, path, 'open');
    }
    const handle = await this.getFileHandleByPath({
      path,
      options: { create: true },
      ensureDir,
      syscall: 'open',
    });
    if (encoding && typeof data === 'string') {
      data = encodeString(data, encoding);
    }
    if (this.useSyncAccessHandleForFile) {
      const writeHandle = await handle.createSyncAccessHandle();
      try {
        const buffer =
          typeof data === 'string'
            ? Buffer.from(data)
            : data instanceof Blob
              ? await data.arrayBuffer()
              : data;
        const bytesWritten = writeHandle.write(
          buffer,
          isAppend ? { at: writeHandle.getSize() } : { at: 0 },
        );
        // A sync access handle keeps existing content, so an overwrite that is
        // shorter than the previous file would leave residual trailing bytes.
        if (!isAppend) writeHandle.truncate(bytesWritten);
        if (flush) writeHandle.flush();
      } finally {
        writeHandle.close();
      }
    } else {
      const writeable = await handle.createWritable({ keepExistingData: isAppend });
      const abortHandler = signal
        ? () => {
            void writeable.abort(signal.reason).catch(() => {});
          }
        : null;
      try {
        if (abortHandler) signal!.addEventListener('abort', abortHandler);
        if (isAppend) {
          const { size } = await handle.getFile();
          await writeable.seek(size);
        }
        await writeable.write(data);
        await writeable.close();
      } catch (e) {
        await writeable.abort().catch(() => {});
        throw e;
      } finally {
        if (abortHandler) signal!.removeEventListener('abort', abortHandler);
      }
    }
  }

  async unlink(path: PathLike): Promise<void> {
    const { dirs, filename } = splitPathToDirsAndFilename(path);
    const handle = await this.getDirHandleByPaths({ paths: dirs, path, syscall: 'unlink' });
    try {
      await handle.getFileHandle(filename);
    } catch (e) {
      throw createError(
        this.isTypeMismatchError(e) ? FsaErrorCode.EPERM : FsaErrorCode.ENOENT,
        path,
        'unlink',
        e,
      );
    }
    await handle.removeEntry(filename);
  }

  readdir(
    path: PathLike,
    options?: { withFileTypes?: false; recursive?: boolean } | null,
  ): Promise<string[]>;
  readdir(
    path: PathLike,
    options: { encoding: 'buffer'; withFileTypes?: false; recursive?: boolean } | 'buffer',
  ): Promise<Buffer[]>;
  readdir(path: PathLike, options: { withFileTypes: true; recursive?: boolean }): Promise<Dirent[]>;
  async readdir(
    path: PathLike,
    options?:
      | { encoding?: 'buffer' | null; withFileTypes?: boolean; recursive?: boolean }
      | 'buffer'
      | null,
  ): Promise<string[] | Buffer[] | Dirent[]> {
    const { encoding, withFileTypes, recursive } = this.normalizeOptions(options);
    const paths = splitPath(path);
    const handle = await this.getDirHandleByPaths({ paths, path, syscall: 'scandir' });
    if (withFileTypes) return this.readdirToDirentByHandle(joinPaths(paths), handle, recursive);
    const files = await this.readdirByHandle('', handle, recursive);
    return encoding === 'buffer' ? files.map(f => Buffer.from(f)) : files;
  }

  mkdir(path: PathLike, options?: { recursive?: false } | null): Promise<void>;
  mkdir(path: PathLike, options: { recursive: true }): Promise<string | undefined>;
  async mkdir(
    path: PathLike,
    options?: { recursive?: boolean } | null,
  ): Promise<string | undefined | void> {
    const paths = splitPath(path);
    if (options?.recursive) {
      if (!paths.length) return undefined;
      const { index, isFile } = await this.probeFirstMissingSegment(paths);
      if (isFile) {
        // A file at the target path -> EEXIST; a file at an intermediate
        // segment -> ENOTDIR (matches fs/promises).
        throw createError(
          index === paths.length - 1 ? FsaErrorCode.EEXIST : FsaErrorCode.ENOTDIR,
          path,
          'mkdir',
        );
      }
      await this.getDirHandleByPaths({ paths, options: { create: true }, path, syscall: 'mkdir' });
      // Node returns the path of the first (topmost) directory that was
      // created, or undefined if every segment already existed.
      return index < 0 ? undefined : joinPaths(paths.slice(0, index + 1));
    }
    if (!paths.length) throw createError(FsaErrorCode.EEXIST, path, 'mkdir');
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const output: GetDirHandleByPathsOutput = {};
    const parent = await this.getDirHandleByPaths({ paths: dirs, path, output, syscall: 'mkdir' });
    // A cached entry means the directory already exists (from the library's
    // point of view), so a non-recursive mkdir must fail with EEXIST.
    if (output.dirCache?.has(filename) || (await this.isDirExistOnHandle(parent, filename))) {
      throw createError(FsaErrorCode.EEXIST, path, 'mkdir');
    }
    const handlePromise = parent.getDirectoryHandle(filename, { create: true });
    output.dirCache?.set(filename, {
      handle: handlePromise,
      children: new Map(),
      create: true,
    });
    await handlePromise.catch(e => {
      output.dirCache?.delete(filename);
      throw e;
    });
  }

  async rmdir(path: PathLike, options?: { recursive?: boolean }): Promise<void> {
    const paths = splitPath(path);
    // The root directory cannot be removed; align with Node's `rmdir('.')`.
    if (!paths.length) throw createError(FsaErrorCode.EINVAL, path, 'rmdir');
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const output: GetDirHandleByPathsOutput = {};
    const handle = await this.getDirHandleByPaths({ paths: dirs, path, output, syscall: 'rmdir' });
    try {
      await handle.getDirectoryHandle(filename);
    } catch (e) {
      if (this.isTypeMismatchError(e)) throw createError(FsaErrorCode.ENOTDIR, path, 'rmdir', e);
      // Node's recursive rmdir stats the target first, so a missing target
      // surfaces as `stat` rather than `rmdir`.
      throw createError(FsaErrorCode.ENOENT, path, options?.recursive ? 'stat' : 'rmdir', e);
    }
    try {
      await handle.removeEntry(filename, { recursive: options?.recursive });
    } catch (e) {
      throw createError(FsaErrorCode.ENOTEMPTY, path, 'rmdir', e);
    }
    // Only invalidate the cache once the directory is actually gone.
    output.dirCache?.delete(filename);
  }

  async exists(path: PathLike) {
    try {
      const paths = splitPath(path);
      if (!paths.length) return true;
      await this.getFileHandleByPath({ path });
      return true;
    } catch (e) {
      // EISDIR means the target is a directory, which still counts as existing.
      return e instanceof FsaError && e.code === FsaErrorCode.EISDIR;
    }
  }

  stat(path: PathLike, opts?: { bigint?: false }): Promise<Stats>;
  stat(path: PathLike, opts: { bigint: true }): Promise<BigIntStats>;
  async stat(path: PathLike, opts?: { bigint?: boolean }): Promise<Stats | BigIntStats> {
    const StatConstructor = opts?.bigint ? BigIntStats : Stats;
    const paths = splitPath(path);
    if (!paths.length) return StatConstructor.create();
    try {
      const handle = await this.getFileHandleByPaths({ paths, path, syscall: 'stat' });
      const file = await handle.getFile();
      return StatConstructor.create(file);
    } catch (e) {
      // EISDIR means the target itself is a directory (not a missing entry or
      // a file in the path), so return directory stats.
      if (e instanceof FsaError && e.code === FsaErrorCode.EISDIR) {
        return StatConstructor.create();
      }
      throw e;
    }
  }

  /**
   * Same as `stat()` because symlink isn't implemented
   */
  lstat(path: PathLike, opts?: { bigint?: false }): Promise<Stats>;
  lstat(path: PathLike, opts: { bigint: true }): Promise<BigIntStats>;
  lstat(path: PathLike, opts?: { bigint?: boolean }): Promise<Stats | BigIntStats> {
    return this.stat(path, opts as any);
  }

  /**
   * Not implemented, don't use
   */
  // eslint-disable-next-line unused-imports/no-unused-vars
  async readlink(path: PathLike, options?: any) {
    throw new Error('Not implemented: readlink');
  }

  /**
   * Not implemented, don't use
   */
  // eslint-disable-next-line unused-imports/no-unused-vars
  async symlink(target: PathLike, path: PathLike, type?: string | null) {
    throw new Error('Not implemented: symlink');
  }

  /**
   * Do nothing, just for compatibility
   */
  // eslint-disable-next-line unused-imports/no-unused-vars
  async chmod(path: PathLike, mode: string | number) {}

  /**
   * Manually clear the dir handle cache
   */
  clearDirCache() {
    this.dirCache?.clear();
  }

  private async readdirByHandle(
    base: string,
    parent: FileSystemDirectoryHandle,
    recursive?: boolean,
  ): Promise<string[]> {
    // Collect into a nested array and flatten once at the end to avoid the
    // argument-count limit of `push(...spread)` on large directories.
    const files: (string | string[])[] = [];
    for await (const handle of parent.values()) {
      const name = base ? `${base}/${handle.name}` : handle.name;
      files.push(name);
      if (recursive && handle.kind === 'directory') {
        files.push(
          await this.readdirByHandle(name, handle as FileSystemDirectoryHandle, recursive),
        );
      }
    }
    return files.flat();
  }

  private async readdirToDirentByHandle(
    base: string,
    parent: FileSystemDirectoryHandle,
    recursive?: boolean,
  ): Promise<Dirent[]> {
    const files: (Dirent | Dirent[])[] = [];
    for await (const handle of parent.values()) {
      files.push(
        Dirent.create(
          handle.name,
          base || '.',
          handle.kind === 'directory' ? FileType.Directory : FileType.File,
        ),
      );
      if (recursive && handle.kind === 'directory') {
        files.push(
          await this.readdirToDirentByHandle(
            base ? `${base}/${handle.name}` : handle.name,
            handle as FileSystemDirectoryHandle,
            recursive,
          ),
        );
      }
    }
    return files.flat();
  }

  private async isDirExistOnHandle(handle: FileSystemDirectoryHandle, name: string) {
    try {
      await handle.getDirectoryHandle(name);
      return true;
    } catch (e) {
      return this.isTypeMismatchError(e);
    }
  }

  /**
   * Walks `paths` from the root (without creating) to find the index of the
   * first segment that does not yet exist. Returns `index: -1` when every
   * segment already exists, and `isFile: true` when the first non-directory
   * segment is actually a file.
   */
  private async probeFirstMissingSegment(
    paths: string[],
  ): Promise<{ index: number; isFile: boolean }> {
    let dir = await this.rootHandle;
    for (let i = 0; i < paths.length; i++) {
      try {
        dir = await dir.getDirectoryHandle(paths[i]);
      } catch (e) {
        return { index: i, isFile: this.isTypeMismatchError(e) };
      }
    }
    return { index: -1, isFile: false };
  }

  private isTypeMismatchError(e: any): boolean {
    if (e instanceof DOMException) return e.name === 'TypeMismatchError';
    if (e instanceof Error) return this.isTypeMismatchError(e.cause);
    return false;
  }

  private normalizeOptions<T extends { encoding?: string | null }>(options?: string | T | null): T {
    return (typeof options === 'string' ? { encoding: options } : options || {}) as T;
  }

  private getFileHandleByPath(options: GetFileHandleByPathOptions) {
    return this.getFileHandleByPaths({ paths: splitPath(options.path), ...options });
  }

  private async getFileHandleByPaths({
    paths,
    options,
    path,
    ensureDir,
    syscall = 'open',
  }: GetFileHandleByPathsOptions) {
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const dirHandle = await this.getDirHandleByPaths({
      paths: dirs,
      path,
      options: ensureDir ? { create: true } : undefined,
      syscall,
    });
    try {
      return await dirHandle.getFileHandle(filename, options);
    } catch (e) {
      // A TypeMismatchError here means the target itself is a directory.
      const code = this.isTypeMismatchError(e) ? FsaErrorCode.EISDIR : FsaErrorCode.ENOENT;
      throw createError(code, path ?? joinPaths(paths), syscall, e);
    }
  }

  private getDirHandleByPath(options: GetDirHandleByPathOptions) {
    return this.getDirHandleByPaths({ paths: splitPath(options.path), ...options });
  }

  private async getDirHandleByPaths({
    paths,
    options,
    path,
    rootHandle = this.rootHandle,
    output,
    syscall = 'open',
    bypassCache = false,
  }: GetDirHandleByPathsOptions) {
    const useCache = !!this.dirCache && !bypassCache;
    if (!paths.length) {
      if (useCache && output) {
        output.dirCache = this.dirCache;
      }
      return rootHandle;
    }
    try {
      if (useCache) {
        const rootNode: DirCacheNode = {
          handle: rootHandle,
          children: this.dirCache!,
          create: true,
        };
        const create = options?.create ?? false;
        const targetNode = await paths.reduce<Promise<DirCacheNode>>(
          async (parentNodePromise, path): Promise<DirCacheNode> => {
            const { handle: parentHandle, children: parentChildren } = await parentNodePromise;
            const cachedNode = parentChildren.get(path);
            if (
              cachedNode &&
              !(
                create &&
                !cachedNode.create &&
                (await cachedNode.handle.then(() => false).catch(() => true))
              )
            ) {
              return cachedNode;
            }
            const node: DirCacheNode = {
              handle: parentHandle
                .then(handle => handle.getDirectoryHandle(path, options))
                .catch(e => {
                  parentChildren.delete(path);
                  throw e;
                }),
              children: new Map(),
              create,
            };
            parentChildren.set(path, node);
            return node;
          },
          Promise.resolve(rootNode),
        );
        // Await here so navigation failures are wrapped consistently with the
        // non-cached path below.
        const handle = await targetNode.handle;
        if (output) output.dirCache = targetNode.children;
        return handle;
      }
      return await paths.reduce<Promise<FileSystemDirectoryHandle>>(
        async (dirHandle, path) => (await dirHandle).getDirectoryHandle(path, options),
        rootHandle,
      );
    } catch (e) {
      // A TypeMismatchError means a path segment is a file, not a directory.
      const code = this.isTypeMismatchError(e) ? FsaErrorCode.ENOTDIR : FsaErrorCode.ENOENT;
      throw createError(code, path ?? joinPaths(paths), syscall, e);
    }
  }
}

export * from './dirent';
export { FsaError, FsaErrorCode } from './error';
export * from './stat';
export * from './types';
