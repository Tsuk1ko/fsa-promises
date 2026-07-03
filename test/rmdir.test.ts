import { beforeEach, describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { expectFsError, useMockFs } from './utils/setup';

describe('rmdir', () => {
  useMockFs();

  beforeEach(() => {
    mock.makeDir('dir1');
    mock.makeDir('dir2/dir1');
    mock.makeDir('dir2/dir2');
    mock.createFile('file1');
    mock.createFile('file2');
    mock.createFile('dir2/dir1/file1');
  });

  test('recursive: false', async () => {
    const fs = new FsaPromises();

    expect(mock.exists('dir1')).toBeTrue();
    expect(await fs.rmdir('dir1')).toBeUndefined();
    expect(mock.exists('dir1')).toBeFalse();

    expect(mock.exists('dir2/dir2')).toBeTrue();
    expect(await fs.rmdir('dir2/dir2')).toBeUndefined();
    expect(mock.exists('dir2/dir2')).toBeFalse();
  });

  test('recursive: true', async () => {
    const fs = new FsaPromises();

    expect(mock.exists('dir1')).toBeTrue();
    expect(await fs.rmdir('dir1', { recursive: true })).toBeUndefined();
    expect(mock.exists('dir1')).toBeFalse();

    expect(mock.exists('dir2')).toBeTrue();
    expect(await fs.rmdir('dir2', { recursive: true })).toBeUndefined();
    expect(mock.exists('dir2')).toBeFalse();
  });

  test('not exist => ENOENT rmdir (non-recursive)', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('not-exist'), {
      code: 'ENOENT',
      syscall: 'rmdir',
      message: "ENOENT: no such file or directory, rmdir 'not-exist'",
    });
  });

  test('not exist => ENOENT stat (recursive)', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('not-exist', { recursive: true }), {
      code: 'ENOENT',
      syscall: 'stat',
    });
  });

  test('non-empty non-recursive => ENOTEMPTY rmdir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('dir2'), {
      code: 'ENOTEMPTY',
      syscall: 'rmdir',
      message: "ENOTEMPTY: directory not empty, rmdir 'dir2'",
    });
  });

  test('target is a file => ENOTDIR rmdir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('file1'), {
      code: 'ENOTDIR',
      syscall: 'rmdir',
      message: "ENOTDIR: not a directory, rmdir 'file1'",
    });
  });

  test('parent is a file => ENOTDIR rmdir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('file1/x'), {
      code: 'ENOTDIR',
      syscall: 'rmdir',
    });
  });

  test('root (".") cannot be removed => EINVAL rmdir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('.'), {
      code: 'EINVAL',
      syscall: 'rmdir',
      message: "EINVAL: invalid argument, rmdir '.'",
    });
    // still present after the failed attempt
    expect(mock.exists('dir1')).toBeTrue();
  });

  test('root (".") recursive cannot be removed => EINVAL rmdir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir('.', { recursive: true }), {
      code: 'EINVAL',
      syscall: 'rmdir',
    });
  });

  test('empty path ("") => EINVAL rmdir (not distinguished from ".")', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.rmdir(''), {
      code: 'EINVAL',
      syscall: 'rmdir',
      message: "EINVAL: invalid argument, rmdir ''",
    });
  });

  test('root cache is not corrupted by a rmdir(".") attempt', async () => {
    const fs = new FsaPromises({ cacheDirHandle: true });
    await fs.mkdir('keep');
    await expectFsError(fs.rmdir('.'), { code: 'EINVAL', syscall: 'rmdir' });
    // @ts-ignore access private cache for testing
    expect(fs.dirCache.has('keep')).toBeTrue();
    expect(mock.isDir('keep')).toBeTrue();
  });
});
