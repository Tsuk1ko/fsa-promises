import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { expectFsError, useMockFs } from './utils/setup';

describe('mkdir', () => {
  useMockFs();

  describe('recursive: false', () => {
    test('creates dir and returns undefined', async () => {
      const fs = new FsaPromises();
      expect(await fs.mkdir('dir1')).toBeUndefined();
      expect(mock.isDir('dir1')).toBeTrue();
    });

    test('nested', async () => {
      const fs = new FsaPromises();
      mock.makeDir('dir1');
      expect(await fs.mkdir('dir1/dir2')).toBeUndefined();
      expect(mock.isDir('dir1/dir2')).toBeTrue();
    });

    test('already exists => EEXIST mkdir', async () => {
      const fs = new FsaPromises();
      mock.makeDir('dir1');
      await expectFsError(fs.mkdir('dir1'), {
        code: 'EEXIST',
        syscall: 'mkdir',
        message: "EEXIST: file already exists, mkdir 'dir1'",
      });
    });

    test('target is a file => EEXIST mkdir', async () => {
      const fs = new FsaPromises();
      mock.createFile('file1');
      await expectFsError(fs.mkdir('file1'), {
        code: 'EEXIST',
        syscall: 'mkdir',
      });
    });

    test('parent not exist => ENOENT mkdir', async () => {
      const fs = new FsaPromises();
      await expectFsError(fs.mkdir('nodir/x'), {
        code: 'ENOENT',
        syscall: 'mkdir',
        message: "ENOENT: no such file or directory, mkdir 'nodir/x'",
      });
    });

    test('parent is a file => ENOTDIR mkdir', async () => {
      const fs = new FsaPromises();
      mock.createFile('file1');
      await expectFsError(fs.mkdir('file1/x'), {
        code: 'ENOTDIR',
        syscall: 'mkdir',
      });
    });

    test("mkdir('.') => EEXIST mkdir", async () => {
      const fs = new FsaPromises();
      await expectFsError(fs.mkdir('.'), {
        code: 'EEXIST',
        syscall: 'mkdir',
      });
    });
  });

  describe('recursive: true', () => {
    test('all new => returns topmost created dir', async () => {
      const fs = new FsaPromises();
      expect(await fs.mkdir('ra/rb/rc', { recursive: true })).toBe('ra');
      expect(mock.isDir('ra/rb/rc')).toBeTrue();
    });

    test('partial existing => returns first created dir', async () => {
      const fs = new FsaPromises();
      mock.makeDir('dir1');
      expect(await fs.mkdir('dir1/new1/new2', { recursive: true })).toBe('dir1/new1');
      expect(mock.isDir('dir1/new1/new2')).toBeTrue();
    });

    test('all existing => returns undefined', async () => {
      const fs = new FsaPromises();
      mock.makeDir('dir1/dir2');
      expect(await fs.mkdir('dir1/dir2', { recursive: true })).toBeUndefined();
    });

    test("mkdir('.') => returns undefined", async () => {
      const fs = new FsaPromises();
      expect(await fs.mkdir('.', { recursive: true })).toBeUndefined();
    });

    test('target is existing file => EEXIST mkdir', async () => {
      const fs = new FsaPromises();
      mock.createFile('file1');
      await expectFsError(fs.mkdir('file1', { recursive: true }), {
        code: 'EEXIST',
        syscall: 'mkdir',
      });
    });

    test('intermediate segment is a file => ENOTDIR mkdir', async () => {
      const fs = new FsaPromises();
      mock.createFile('file1');
      await expectFsError(fs.mkdir('file1/sub/x', { recursive: true }), {
        code: 'ENOTDIR',
        syscall: 'mkdir',
      });
    });
  });
});
