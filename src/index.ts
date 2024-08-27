import { Buffer } from 'buffer/';
import { Dirent } from './dirent';
import { FileType } from './types';
import type { Abortable, ObjectEncodingOptions, BufferEncoding, OpenMode, PathLike } from './types';
import { BigIntStats, Stats } from './stat';
import { joinPaths, pathsToDirsAndFilename, splitPath, splitPathToDirsAndFilename } from './path';
import { decodeBuffer, encodeString } from './textCoder';
import { createError, FsaError, FsaErrorCode } from './error';

export interface FsaPromisesOptions {
  root?: string | FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>;
  useSyncAccessHandleForFile?: boolean;
}

export class FsaPromises {
  private readonly rootHandle: Promise<FileSystemDirectoryHandle>;

  private readonly useSyncAccessHandleForFile: boolean;

  constructor(options?: FsaPromisesOptions | FsaPromisesOptions['root']) {
    const { root = '', useSyncAccessHandleForFile = false } =
      typeof options === 'string' || options instanceof FileSystemDirectoryHandle || options instanceof Promise
        ? { root: options }
        : options || {};
    this.useSyncAccessHandleForFile = useSyncAccessHandleForFile;
    if (typeof root === 'string') {
      this.rootHandle = this.getDirHandleByPath(root, { create: true }, navigator.storage.getDirectory());
      return;
    }
    this.rootHandle = Promise.resolve(root);
    this.readFile('', { encoding: 'ascii' });
  }

  readFile(path: PathLike, options?: { encoding?: null } | null): Promise<Buffer>;
  readFile(path: PathLike, options: { encoding: BufferEncoding } | BufferEncoding): Promise<string>;
  async readFile(path: PathLike, options?: ObjectEncodingOptions | BufferEncoding | null): Promise<string | Buffer> {
    const { encoding } = this.normalizeOptions(options);
    const handle = await this.getFileHandleByPath(path);
    const content = await (await handle.getFile()).arrayBuffer();
    if (encoding) return decodeBuffer(content, encoding);
    return Buffer.from(content);
  }

  async writeFile(
    path: PathLike,
    data: Buffer | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: (ObjectEncodingOptions & { flag?: OpenMode; flush?: boolean } & Abortable) | BufferEncoding | null,
  ): Promise<void> {
    const { encoding, signal, flag, flush } = this.normalizeOptions(options);
    if (typeof flag === 'number') throw new Error('Not implemented: number flag');
    const isAppend = flag?.includes('a');
    const failsWhenExist = flag?.includes('x');
    if (failsWhenExist && (await this.exist(path))) {
      throw createError(FsaErrorCode.EEXIST, path, 'open');
    }
    const handle = await this.getFileHandleByPath(path, { create: true });
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
    const handle = await this.getDirHandleByPaths(dirs, undefined, path);
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
    const handle = await this.getDirHandleByPaths(paths, undefined, path);
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
      await this.getDirHandleByPaths(paths, { create: true }, path);
      // Not fully following the original implementation
      return joinPaths(paths);
    }
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const parent = await this.getDirHandleByPaths(dirs, undefined, path);
    if (await this.isDirExistOnHandle(parent, filename)) {
      throw createError(FsaErrorCode.EEXIST, path, 'mkdir');
    }
    await parent.getDirectoryHandle(filename, { create: true });
  }

  async rmdir(path: PathLike, options?: { recursive?: boolean }): Promise<void> {
    const { dirs, filename } = splitPathToDirsAndFilename(path);
    const handle = await this.getDirHandleByPaths(dirs, undefined, path);
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

  async exist(path: PathLike) {
    try {
      await this.getFileHandleByPath(path);
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
      const handle = await this.getFileHandleByPaths(paths, undefined, path);
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

  private getFileHandleByPath(path: PathLike, options?: FileSystemGetDirectoryOptions) {
    return this.getFileHandleByPaths(splitPath(path), options, path);
  }

  private async getFileHandleByPaths(paths: string[], options?: FileSystemGetFileOptions, path?: PathLike) {
    const { dirs, filename } = pathsToDirsAndFilename(paths);
    const dirHandle = await this.getDirHandleByPaths(dirs, undefined, path);
    try {
      return await dirHandle.getFileHandle(filename, options);
    } catch (e) {
      throw createError(FsaErrorCode.ENOENT, path ?? joinPaths(paths), 'open', e);
    }
  }

  private getDirHandleByPath(path: PathLike, options?: FileSystemGetDirectoryOptions, rootHandle = this.rootHandle) {
    return this.getDirHandleByPaths(splitPath(path), options, path, rootHandle);
  }

  private async getDirHandleByPaths(
    paths: string[],
    options?: FileSystemGetDirectoryOptions,
    path?: PathLike,
    rootHandle = this.rootHandle,
  ) {
    if (!paths.length) return rootHandle;
    try {
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
