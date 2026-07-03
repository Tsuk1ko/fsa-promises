import { Buffer } from 'buffer/';
import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT_BUFFER, expectSameBuffer, useMockFs } from './utils/setup';

const getCache = (fs: FsaPromises): Map<string, any> =>
  // @ts-ignore access private for testing
  fs.dirCache!;

describe('dirCache', () => {
  useMockFs();

  test('lifecycle: write / overwrite / unlink / rmdir / clear', async () => {
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);

    const fs = new FsaPromises({ cacheDirHandle: true });
    const dirCache = getCache(fs);
    expect(dirCache).toBeDefined();

    const hasFooBar = () => dirCache.get('foo')?.children.has('bar');

    // write populates cache
    await fs.writeFile(filepath, CONTENT_BUFFER);
    expect(hasFooBar()).toBeTrue();
    expect(await fs.exists(filepath)).toBeTrue();
    expectSameBuffer(await fs.readFile(filepath), CONTENT_BUFFER);

    // overwrite keeps cache
    const randomContent = Buffer.from(Math.random().toString());
    await fs.writeFile(filepath, randomContent);
    expect(hasFooBar()).toBeTrue();
    expectSameBuffer(await fs.readFile(filepath), randomContent);

    // unlink keeps dir cache
    await fs.unlink(filepath);
    expect(hasFooBar()).toBeTrue();
    expect(await fs.exists(filepath)).toBeFalse();

    // rmdir removes nested cache entry
    await fs.rmdir(dir);
    expect(hasFooBar()).toBeFalse();
    expect(dirCache.has('foo')).toBeTrue();

    // rmdir root-level removes top cache entry
    await fs.rmdir('foo');
    expect(dirCache.has('foo')).toBeFalse();

    // clear
    await fs.mkdir('foo');
    expect(dirCache.size).toBe(1);
    fs.clearDirCache();
    expect(dirCache.size).toBe(0);
  });

  test('node stores create flag', async () => {
    const fs = new FsaPromises({ cacheDirHandle: true });
    await fs.mkdir('created', { recursive: true });
    const node = getCache(fs).get('created');
    expect(node.create).toBeTrue();
  });

  describe('constructor with string root must not poison cache', () => {
    test('nested reads/writes resolve relative to the logical root', async () => {
      const fs = new FsaPromises({ root: 'a/b', cacheDirHandle: true });
      // logical root is OPFS/a/b; the cache must start empty (root path not cached)
      expect(getCache(fs).size).toBe(0);

      await fs.writeFile('a/x.txt', 'hi', { ensureDir: true });
      // must be written under the logical root: OPFS/a/b/a/x.txt
      expect(mock.exists('a/b/a/x.txt')).toBeTrue();
      expect(mock.exists('a/x.txt')).toBeFalse();
      expectSameBuffer(await fs.readFile('a/x.txt'), Buffer.from('hi'));
    });

    test('mkdir of a dir named like the root first segment', async () => {
      const fs = new FsaPromises({ root: 'data', cacheDirHandle: true });
      expect(await fs.mkdir('data')).toBeUndefined();
      expect(mock.exists('data/data')).toBeTrue();
    });
  });

  describe('create vs non-create distinction', () => {
    test('concurrent read (non-create) and ensureDir write (create) on missing dir', async () => {
      const fs = new FsaPromises({ cacheDirHandle: true });
      const [readResult, writeResult] = await Promise.allSettled([
        fs.readFile('foo/a.txt'),
        fs.writeFile('foo/b.txt', 'x', { ensureDir: true }),
      ]);
      expect(readResult.status).toBe('rejected');
      expect(writeResult.status).toBe('fulfilled');
      expect(mock.exists('foo/b.txt')).toBeTrue();
    });

    test('failed non-create lookup does not block a later create', async () => {
      const fs = new FsaPromises({ cacheDirHandle: true });
      // non-create lookup fails and cleans itself up
      await expect(fs.readFile('foo/a.txt')).rejects.toThrow();
      // subsequent create must still succeed
      await fs.mkdir('foo', { recursive: true });
      expect(mock.isDir('foo')).toBeTrue();
    });
  });
});
