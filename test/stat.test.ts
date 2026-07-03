import { beforeEach, describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT_BUFFER, expectFsError, useMockFs } from './utils/setup';

describe('stat', () => {
  useMockFs();

  beforeEach(() => {
    mock.makeDir('dir1');
    mock.createFile('file1', CONTENT_BUFFER);
    mock.createFile('file2');
    mock.createFile('dir1/file1', CONTENT_BUFFER);
  });

  const checkStat = async (fs: FsaPromises, path: string, size: number, isFile: boolean) => {
    const stat = await fs.stat(path);
    expect(stat.isFile()).toBe(isFile);
    expect(stat.isDirectory()).toBe(!isFile);
    expect(stat.size).toBe(size);
  };

  test('file', async () => {
    const fs = new FsaPromises();
    await checkStat(fs, 'file1', CONTENT_BUFFER.byteLength, true);
    await checkStat(fs, 'file2', 0, true);
    await checkStat(fs, 'dir1/file1', CONTENT_BUFFER.byteLength, true);
  });

  test('dir', async () => {
    const fs = new FsaPromises();
    await checkStat(fs, '.', 0, false);
    await checkStat(fs, 'dir1', 0, false);
  });

  test('bigint', async () => {
    const fs = new FsaPromises();
    const stat = await fs.stat('file1', { bigint: true });
    expect(typeof stat.size).toBe('bigint');
    expect(stat.size).toBe(BigInt(CONTENT_BUFFER.byteLength));
    expect(typeof stat.atimeNs).toBe('bigint');
  });

  test('not exist => ENOENT stat', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.stat('not-exist'), {
      code: 'ENOENT',
      syscall: 'stat',
      message: "ENOENT: no such file or directory, stat 'not-exist'",
    });
    await expectFsError(fs.stat('dir1/not-exist'), {
      code: 'ENOENT',
      syscall: 'stat',
    });
  });

  test('parent is a file => ENOTDIR stat', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.stat('file1/x'), {
      code: 'ENOTDIR',
      syscall: 'stat',
    });
  });
});

describe('lstat', () => {
  useMockFs();

  test('same as stat', async () => {
    const fs = new FsaPromises();
    mock.createFile('file1', CONTENT_BUFFER);
    const stat = await fs.lstat('file1');
    expect(stat.isFile()).toBeTrue();
    expect(stat.size).toBe(CONTENT_BUFFER.byteLength);
  });
});
