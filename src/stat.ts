import { FileType } from './types';

abstract class StatsBase<T extends number | bigint> {
  #type: FileType;

  abstract dev: T;
  abstract ino: T;
  abstract mode: T;
  abstract nlink: T;
  abstract uid: T;
  abstract gid: T;
  abstract rdev: T;
  abstract size: T;
  abstract blksize: T;
  abstract blocks: T;
  abstract atimeMs: T;
  abstract mtimeMs: T;
  abstract ctimeMs: T;
  abstract birthtimeMs: T;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;

  constructor(file?: File) {
    this.#type = file ? FileType.File : FileType.Directory;

    const date = file ? new Date(file.lastModified) : new Date(0);
    this.atime = date;
    this.mtime = date;
    this.ctime = date;
    this.birthtime = date;
  }

  isFile() {
    return this.#type === FileType.File;
  }

  isDirectory() {
    return this.#type === FileType.Directory;
  }

  isBlockDevice() {
    return false;
  }

  isCharacterDevice() {
    return false;
  }

  isSymbolicLink() {
    return false;
  }

  isFIFO() {
    return false;
  }

  isSocket() {
    return false;
  }
}

export class Stats extends StatsBase<number> {
  dev = 0;
  ino = 0;
  mode = 0o777;
  nlink = 1;
  uid = 0;
  gid = 0;
  rdev = 0;
  size = 0;
  blksize = 0;
  blocks = 1;
  atimeMs = 0;
  mtimeMs = 0;
  ctimeMs = 0;
  birthtimeMs = 0;

  private constructor(file?: File) {
    super(file);

    if (file) {
      const { size, lastModified } = file;
      this.size = size;
      this.blksize = size;
      this.atimeMs = lastModified;
      this.mtimeMs = lastModified;
      this.ctimeMs = lastModified;
      this.birthtimeMs = lastModified;
    }
  }

  static create(file?: File) {
    return new Stats(file);
  }
}

export class BigIntStats extends StatsBase<bigint> {
  dev = 0n;
  ino = 0n;
  mode = 0o777n;
  nlink = 1n;
  uid = 0n;
  gid = 0n;
  rdev = 0n;
  size = 0n;
  blksize = 0n;
  blocks = 1n;
  atimeMs = 0n;
  mtimeMs = 0n;
  ctimeMs = 0n;
  birthtimeMs = 0n;
  atimeNs = 0n;
  mtimeNs = 0n;
  ctimeNs = 0n;
  birthtimeNs = 0n;

  private constructor(file?: File) {
    super(file);

    if (file) {
      const size = BigInt(file.size);
      const lastModified = BigInt(file.lastModified);
      const lastModifiedNs = lastModified * 1000000n;
      this.size = size;
      this.blksize = size;
      this.atimeMs = lastModified;
      this.mtimeMs = lastModified;
      this.ctimeMs = lastModified;
      this.birthtimeMs = lastModified;
      this.atimeNs = lastModifiedNs;
      this.mtimeNs = lastModifiedNs;
      this.ctimeNs = lastModifiedNs;
      this.birthtimeNs = lastModifiedNs;
    }
  }

  static create(file?: File) {
    return new BigIntStats(file);
  }
}
