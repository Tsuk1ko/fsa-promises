import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT_BUFFER, expectFsError, useMockFs } from './utils/setup';

const FILEPATH = 'test.txt';

describe('unlink', () => {
  useMockFs();

  test('file in root', async () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    expect(mock.exists(FILEPATH)).toBeTruthy();
    expect(await fs.unlink(FILEPATH)).toBeUndefined();
    expect(mock.exists(FILEPATH)).toBeFalsy();
  });

  test('file in dir', async () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    mock.createFile(filepath, CONTENT_BUFFER);
    expect(mock.exists(filepath)).toBeTruthy();
    expect(await fs.unlink(filepath)).toBeUndefined();
    expect(mock.exists(filepath)).toBeFalsy();
  });

  test('not exist => ENOENT unlink', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.unlink(FILEPATH), {
      code: 'ENOENT',
      syscall: 'unlink',
      message: `ENOENT: no such file or directory, unlink '${FILEPATH}'`,
    });
  });

  test('nested parent missing => ENOENT unlink', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.unlink('nodir/x.txt'), {
      code: 'ENOENT',
      syscall: 'unlink',
    });
  });

  test('target is a directory => EPERM unlink', async () => {
    const fs = new FsaPromises();
    mock.makeDir('foo/bar');
    await expectFsError(fs.unlink('foo/bar'), {
      code: 'EPERM',
      syscall: 'unlink',
      message: "EPERM: operation not permitted, unlink 'foo/bar'",
    });
  });

  test('parent is a file => ENOTDIR unlink', async () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    await expectFsError(fs.unlink(`${FILEPATH}/x.txt`), {
      code: 'ENOTDIR',
      syscall: 'unlink',
    });
  });
});
