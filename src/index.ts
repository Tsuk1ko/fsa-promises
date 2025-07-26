import { Buffer } from 'buffer/';
import { Dirent } from './dirent';
import { FileType } from './types';
import type { Abortable, ObjectEncodingOptions, BufferEncoding, OpenMode, PathLike } from './types';
import { BigIntStats, Stats } from './stat';
import { joinPaths, pathsToDirsAndFilename, splitPath, splitPathToDirsAndFilename } from './path';
import { decodeBuffer, encodeString } from './textCoder';
import { createError, FsaError, FsaErrorCode } from './error';

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
  handle: FileSystemDirectoryHandle;
  children: DirCache;
}

type DirCache = Map<string, Promise<DirCacheNode>>;

interface GetDirHandleByPathOptions {
  path: PathLike;
  options?: FileSystemGetDirectoryOptions;
  rootHandle?: Promise<FileSystemDirectoryHandle>;
}

interface GetDirHandleByPathsOptions {
  paths: string[];
  path?: PathLike;
  options?: FileSystemGetDirectoryOptions;
  rootHandle?: Promise<FileSystemDirectoryHandle>;
  output?: GetDirHandleByPathsOutput;
}

interface GetDirHandleByPathsOutput {
  dirCache?: DirCache;
}

interface GetFileHandleByPathOptions {
  path: PathLike;
  options?: FileSystemGetDirectoryOptions;
  ensureDir?: boolean;
}

interface GetFileHandleByPathsOptions {
  paths: string[];
  options?: FileSystemGetFileOptions;
  path?: PathLike;
  ensureDir?: boolean;
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
    } = typeof options === 'string' || options instanceof FileSystemDirectoryHandle || options instanceof Promise
      ? { root: options }
      : options || {};
    this.useSyncAccessHandleForFile = useSyncAccessHandleForFile;
    if (cacheDirHandle) this.dirCache = new Map();
    if (typeof root === 'string') {
      this.rootHandle = this.getDirHandleByPath({
        path: root,
        options: { create: true },
        rootHandle: navigator.storage.getDirectory(),
      });
      return;
    }
    this.rootHandle = Promise.resolve(root);
    this.readFile('', { encoding: 'ascii' });
  }

  readFile(path: PathLike, options?: { encoding?: null } | null): Promise<Buffer>;
  readFile(path: PathLike, options: { encoding: BufferEncoding } | BufferEncoding): Promise<string>;
  async readFile(path: PathLike, options?: ObjectEncodingOptions | BufferEncoding | null): Promise<string | Buffer> {
    const { encoding } = this.normalizeOptions(options);
    const handle = await this.getFileHandleByPath({ path });
    const content = await (await handle.getFile()).arrayBuffer();
    if (encoding) return decodeBuffer(content, encoding);
    return Buffer.from(content);
  }

  async writeFile(
    path: PathLike,
    data: Buffer | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: FsaPromisesWriteFileOptions,
  ): Promise<void> {
    const { encoding, signal, flag, flush, ensureDir } = this.normalizeOptions(options);
    if (typeof flag === 'number') throw new Error('Not implemented: number flag');
    const isAppend = flag?.includes('a');
    const failsWhenExist = flag?.includes('x');
    if (failsWhenExist && (await this.exists(path))) {
      throw createError(FsaErrorCode.EEXIST, path, 'open');
    }
    const handle = await this.getFileHandleByPath({ path, options: { create: true }, ensureDir });
    if (encoding && typeof data === 'string') {
      data = encodeString(data, encoding);
    }
    if (this.useSyncAccessHandleForFile) {
      const writeHandle = await handle.createSyncAccessHandle();
      try {
        writeHandle.write(
          typeof data === 'string' ? Buffer.from(data) : data instanceof Blob ? await data.arrayBuffer() : data,
          isAppend ? { at: writeHandle.getSize() } : undefined,
        );
        if (flush) writeHandle.flush();
      } finally {
        writeHandle.close();
      }
    } else {
      const writeable = await handle.createWritable({ keepExistingData: isAppend });
      const abortHandler = signal ? () => writeable.abort(signal.reason) : null;
      try {
        signal?.addEventListener('abort', abortHandler!);
        if (isAppend) {
          const { size } = await handle.getFile();
          await writeable.seek(size);
        }
        await writeable.write(data);
      } finally {
        await writeable.close();
        signal?.removeEventListener('abort', abortHandler!);
      }
    }
  }

  async unlink(path: PathLike): Promise<void> {
    const { dirs, filename } = splitPathToDirsAndFilename(path);
    const handle = await this.getDirHandleByPaths({ paths: dirs, path });
    try {
      await handle.getFileHandle(filename);
    } catch (e) {
      if (this.isTypeMismatchError(e)) {
        throw createError(this.isTypeMismatchError(e) ? FsaErrorCode.EPERM : FsaErrorCode.ENOENT, path, 'unlink', e);
      }
    }
    await handle.removeEntry(filename);
  }

  readdir(path: PathLike, options?: { withFileTypes?: false; recursive?: boolean } | null): Promise<string[]>;
  readdir(path: PathLike, options: { encoding: 'buffer'; withFileTypes?: false; recursive?: boolean } | 'buffer'): Promise<Buffer[]>;
  readdir(path: PathLike, options: { withFileTypes: true; recursive?: boolean }): Promise<Dirent[]>;
  async readdir(
    path: PathLike,
    options?: { encoding?: 'buffer' | null; withFileTypes?: boolean; recursive?: boolean } | 'buffer' | null,
  ): Promise<string[] | Buffer[] | Dirent[]> {
    const { encoding, withFileTypes, recursive } = this.normalizeOptions(options);
    const paths = splitPath(path);
    const handle = await this.getDirHandleByPaths({ paths, path });
    if (withFileTypes) return this.readdirToDirentByHandle(joinPaths(paths), handle, recursive);
    const files = await this.readdirByHandle('', handle, recursive);
    return encoding === 'buffer' ? files.map(f => Buffer.from(f)) : files;
  }

  mkdir(path: PathLike, options?: { recursive?: false } | null): Promise<void>;
  mkdir(path: PathLike, options: { recursive: true }): Promise<string>;
  async mkdir(path: PathLike, options?: { recursive?: boolean } | null): Promise<string | void> {
    const paths = splitPath(path);
    if (options?.recursive) {
      if (!paths.length) return '.';
      await this.getDirHandleByPaths({ paths, options: { create: true }, path });
      // Not fully following the original implementation
      return joinPaths(paths);
    }
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const output: GetDirHandleByPathsOutput = {};
    const parent = await this.getDirHandleByPaths({ paths: dirs, path, output });
    if (await this.isDirExistOnHandle(parent, filename)) {
      throw createError(FsaErrorCode.EEXIST, path, 'mkdir');
    }
    if (output.dirCache?.has(filename)) {
      await output.dirCache.get(filename);
      return;
    }
    const handlePromise = parent.getDirectoryHandle(filename, { create: true });
    output.dirCache?.set(
      filename,
      handlePromise.then(handle => ({ handle, children: new Map() })),
    );
    await handlePromise.catch(e => {
      output.dirCache?.delete(filename);
      throw e;
    });
  }

  async rmdir(path: PathLike, options?: { recursive?: boolean }): Promise<void> {
    const { dirs, filename } = splitPathToDirsAndFilename(path);
    const output: GetDirHandleByPathsOutput = {};
    const handle = await this.getDirHandleByPaths({ paths: dirs, path, output });
    output.dirCache?.delete(filename);
    try {
      await handle.getDirectoryHandle(filename);
    } catch (e) {
      throw createError(FsaErrorCode.ENOENT, path, 'rmdir', e);
    }
    try {
      await handle.removeEntry(filename, { recursive: options?.recursive });
    } catch (e) {
      throw createError(FsaErrorCode.ENOTEMPTY, path, 'rmdir', e);
    }
  }

  async exists(path: PathLike) {
    try {
      await this.getFileHandleByPath({ path });
      return true;
    } catch (e) {
      return this.isTypeMismatchError(e);
    }
  }

  stat(path: PathLike, opts?: { bigint?: false }): Promise<Stats>;
  stat(path: PathLike, opts: { bigint: true }): Promise<BigIntStats>;
  async stat(path: PathLike, opts?: { bigint?: boolean }): Promise<Stats | BigIntStats> {
    const StatConstructor = opts?.bigint ? BigIntStats : Stats;
    const paths = splitPath(path);
    if (!paths.length) return StatConstructor.create();
    try {
      const handle = await this.getFileHandleByPaths({ paths, path });
      const file = await handle.getFile();
      return StatConstructor.create(file);
    } catch (e) {
      if (!this.isTypeMismatchError(e)) {
        if (e instanceof FsaError) throw e;
        throw createError(FsaErrorCode.ENOENT, path, 'stat', e);
      }
      return StatConstructor.create();
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
  async readlink(path: PathLike, options?: any) {
    throw new Error('Not implemented: readlink');
  }

  /**
   * Not implemented, don't use
   */
  async symlink(target: PathLike, path: PathLike, type?: string | null) {
    throw new Error('Not implemented: symlink');
  }

  /**
   * Do nothing, just for compatibility
   */
  async chmod(path: PathLike, mode: string | number) {}

  /**
   * Manually clear the dir handle cache
   */
  clearDirCache() {
    this.dirCache?.clear();
  }

  private async readdirByHandle(base: string, parent: FileSystemDirectoryHandle, recursive?: boolean) {
    const files: string[] = [];
    for await (const handle of parent.values()) {
      const name = base ? `${base}/${handle.name}` : handle.name;
      files.push(name);
      if (recursive && handle.kind === 'directory') {
        files.push(...(await this.readdirByHandle(name, handle as FileSystemDirectoryHandle, recursive)));
      }
    }
    return files;
  }

  private async readdirToDirentByHandle(base: string, parent: FileSystemDirectoryHandle, recursive?: boolean) {
    const files: Dirent[] = [];
    for await (const handle of parent.values()) {
      files.push(Dirent.create(handle.name, base || '.', handle.kind === 'directory' ? FileType.Directory : FileType.File));
      if (recursive && handle.kind === 'directory') {
        files.push(
          ...(await this.readdirToDirentByHandle(
            base ? `${base}/${handle.name}` : handle.name,
            handle as FileSystemDirectoryHandle,
            recursive,
          )),
        );
      }
    }
    return files;
  }

  private async isDirExistOnHandle(handle: FileSystemDirectoryHandle, name: string) {
    try {
      await handle.getDirectoryHandle(name);
      return true;
    } catch (e) {
      return this.isTypeMismatchError(e);
    }
  }

  private isTypeMismatchError(e: any): boolean {
    if (e instanceof DOMException) return e.name.includes('TypeMismatchError');
    if (e instanceof Error) return this.isTypeMismatchError(e.cause);
    return false;
  }

  private normalizeOptions<T extends { encoding?: string | null }>(options?: string | T | null): T {
    return (typeof options === 'string' ? { encoding: options } : options || {}) as T;
  }

  private getFileHandleByPath(options: GetFileHandleByPathOptions) {
    return this.getFileHandleByPaths({ paths: splitPath(options.path), ...options });
  }

  private async getFileHandleByPaths({ paths, options, path, ensureDir }: GetFileHandleByPathsOptions) {
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const dirHandle = await this.getDirHandleByPaths({ paths: dirs, path, options: ensureDir ? { create: true } : undefined });
    try {
      return await dirHandle.getFileHandle(filename, options);
    } catch (e) {
      throw createError(FsaErrorCode.ENOENT, path ?? joinPaths(paths), 'open', e);
    }
  }

  private getDirHandleByPath(options: GetDirHandleByPathOptions) {
    return this.getDirHandleByPaths({ paths: splitPath(options.path), ...options });
  }

  private async getDirHandleByPaths({ paths, options, path, rootHandle = this.rootHandle, output }: GetDirHandleByPathsOptions) {
    if (!paths.length) {
      if (this.dirCache && output) {
        output.dirCache = this.dirCache;
      }
      return rootHandle;
    }
    try {
      if (this.dirCache) {
        const rootNodePromise: Promise<DirCacheNode> = rootHandle.then(handle => ({ handle, children: this.dirCache! }));
        const targetNode = await paths.reduce<Promise<DirCacheNode>>(async (parentNodePromise, path): Promise<DirCacheNode> => {
          const { handle: parentHandle, children: parentChildren } = await parentNodePromise;
          const cachedNodePromise = parentChildren.get(path);
          if (cachedNodePromise) return cachedNodePromise;
          const nodePromise: Promise<DirCacheNode> = parentHandle
            .getDirectoryHandle(path, options)
            .then((handle): DirCacheNode => ({ handle, children: new Map() }))
            .catch(e => {
              parentChildren.delete(path);
              throw e;
            });
          parentChildren.set(path, nodePromise);
          return nodePromise;
        }, rootNodePromise);
        if (output) output.dirCache = targetNode.children;
        return targetNode.handle;
      }
      return await paths.reduce<Promise<FileSystemDirectoryHandle>>(
        async (dirHandle, path) => (await dirHandle).getDirectoryHandle(path, options),
        rootHandle,
      );
    } catch (e) {
      throw createError(FsaErrorCode.ENOENT, path ?? joinPaths(paths), 'open', e);
    }
  }
}

export type { PathLike } from './types';
export * from './dirent';
export * from './stat';
