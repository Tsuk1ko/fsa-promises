import type { Buffer } from 'buffer/';

export enum FileType {
  File,
  Directory,
}

export type PathLike = string | Buffer | URL;

export type OpenMode = number | string;

export type BufferEncoding = string;

export interface ObjectEncodingOptions {
  encoding?: BufferEncoding | null;
}

export interface Abortable {
  signal?: AbortSignal;
}
