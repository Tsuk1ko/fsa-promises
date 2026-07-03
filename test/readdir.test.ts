import { Buffer } from 'buffer/';
import { beforeEach, describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import type { Dirent } from '../src';
import { expectFsError, useMockFs } from './utils/setup';

describe('readdir', () => {
  useMockFs();

  beforeEach(() => {
    mock.makeDir('dir1');
    mock.makeDir('dir2/dir1');
    mock.makeDir('dir2/dir2');
    mock.createFile('file1');
    mock.createFile('file2');
    mock.createFile('dir1/file1');
    mock.createFile('dir2/dir1/file1');
  });

  test('recursive: false', async () => {
    const fs = new FsaPromises();
    expect(await fs.readdir('.')).toEqual(['dir1', 'dir2', 'file1', 'file2']);
    expect(await fs.readdir('dir1')).toEqual(['file1']);
    expect(await fs.readdir('dir2')).toEqual(['dir1', 'dir2']);
    expect(await fs.readdir('dir2/dir1')).toEqual(['file1']);
    expect(await fs.readdir('dir2/dir2')).toEqual([]);
  });

  test('recursive: true', async () => {
    const fs = new FsaPromises();
    expect(await fs.readdir('.', { recursive: true })).toEqual([
      'dir1',
      'dir1/file1',
      'dir2',
      'dir2/dir1',
      'dir2/dir1/file1',
      'dir2/dir2',
      'file1',
      'file2',
    ]);
  });

  test('encoding: "buffer"', async () => {
    const fs = new FsaPromises();
    const nameBuffers = ['dir1', 'dir2', 'file1', 'file2'].map(name => Buffer.from(name));
    const result1 = await fs.readdir('.', 'buffer');
    expect(nameBuffers.every((buf, i) => buf.compare(result1[i]) === 0)).toBeTrue();
    const result2 = await fs.readdir('.', { encoding: 'buffer' });
    expect(nameBuffers.every((buf, i) => buf.compare(result2[i]) === 0)).toBeTrue();
  });

  test('withFileTypes: true', async () => {
    const fs = new FsaPromises();

    const checkDirent = (dirent: Dirent, name: string, parentPath: string, isFile: boolean) => {
      expect(dirent.name).toBe(name);
      expect(dirent.parentPath).toBe(parentPath);
      expect(dirent.isFile()).toBe(isFile);
      expect(dirent.isDirectory()).toBe(!isFile);
    };

    {
      const [dir1, dir2, file1, file2] = await fs.readdir('.', { withFileTypes: true });
      checkDirent(dir1, 'dir1', '.', false);
      checkDirent(dir2, 'dir2', '.', false);
      checkDirent(file1, 'file1', '.', true);
      checkDirent(file2, 'file2', '.', true);
    }

    {
      const [file1] = await fs.readdir('dir1', { withFileTypes: true });
      checkDirent(file1, 'file1', 'dir1', true);
    }

    {
      const [file1] = await fs.readdir('dir2/dir1', { withFileTypes: true });
      checkDirent(file1, 'file1', 'dir2/dir1', true);
    }
  });

  test('not exist => ENOENT scandir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.readdir('not-exist'), {
      code: 'ENOENT',
      syscall: 'scandir',
      message: "ENOENT: no such file or directory, scandir 'not-exist'",
    });
    await expectFsError(fs.readdir('dir1/not-exist'), {
      code: 'ENOENT',
      syscall: 'scandir',
    });
  });

  test('target is a file => ENOTDIR scandir', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.readdir('file1'), {
      code: 'ENOTDIR',
      syscall: 'scandir',
      message: "ENOTDIR: not a directory, scandir 'file1'",
    });
    await expectFsError(fs.readdir('dir1/file1'), {
      code: 'ENOTDIR',
      syscall: 'scandir',
    });
  });
});
