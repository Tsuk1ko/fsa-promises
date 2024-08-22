import { FileType } from './types';

export class Dirent {
  #type: FileType;

  private constructor(public name: string, public parentPath: string, type: FileType) {
    this.#type = type;
  }

  /**
   * @deprecated
   */
  get path() {
    return this.parentPath;
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

  static create(name: string, parentPath: string, type: FileType) {
    return new Dirent(name, parentPath, type);
  }
}
