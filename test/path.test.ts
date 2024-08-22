import { expect, test, describe } from 'bun:test';
import { Buffer } from 'buffer/';
import { pathLikeToString, pathsToDirsAndFilename, splitPath } from '../src/path';

describe('pathLikeToString', () => {
  test('string', () => {
    expect(pathLikeToString('')).toEqual('');
    expect(pathLikeToString('path')).toEqual('path');
  });

  test('URL', () => {
    expect(pathLikeToString(new URL('file:///path/file'))).toEqual('/path/file');
    expect(() => pathLikeToString(new URL('http://example.com'))).toThrow();
  });

  test('Buffer', () => {
    expect(pathLikeToString(Buffer.from('path'))).toEqual('path');
  });
});

describe('splitPath', () => {
  test('root', () => {
    const expected: string[] = [];
    expect(splitPath('')).toEqual(expected);
    expect(splitPath('.')).toEqual(expected);
    expect(splitPath('./')).toEqual(expected);
    expect(splitPath('/')).toEqual(expected);
  });

  test('path', () => {
    const expected = ['a', 'b', 'c'];
    expect(splitPath('a/b/c')).toEqual(expected);
    expect(splitPath('/a/b/c')).toEqual(expected);
    expect(splitPath('./a/b/c')).toEqual(expected);
    expect(splitPath('//a///b//c///')).toEqual(expected);
    expect(splitPath('a\\b\\c')).toEqual(expected);
  });

  test('relative', () => {
    const expected = ['a', 'b', 'c'];
    expect(splitPath('a/././b/./c/.')).toEqual(expected);
    expect(splitPath('d/../a/b/c/d/..')).toEqual(expected);
    expect(splitPath('a/..')).toEqual([]);
    expect(() => splitPath('..')).toThrow();
    expect(() => splitPath('a/../..')).toThrow();
  });
});

describe('pathsToDirsAndFilename', () => {
  test('empty', () => {
    expect(() => pathsToDirsAndFilename([])).toThrow();
  });

  test('one', () => {
    expect(pathsToDirsAndFilename(['a'])).toEqual({
      dirs: [],
      filename: 'a',
    });
  });

  test('multi', () => {
    expect(pathsToDirsAndFilename(['a', 'b', 'c'])).toEqual({
      dirs: ['a', 'b'],
      filename: 'c',
    });
  });
});
