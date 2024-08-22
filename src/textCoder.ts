import { Buffer } from 'buffer/';

export const encodeString = (data: string, encoding?: string) => Buffer.from(data, encoding);

export const decodeBuffer = (buffer: ArrayBuffer, encoding?: string) => Buffer.from(buffer).toString(encoding);
