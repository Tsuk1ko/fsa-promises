import { Buffer } from 'buffer/';
import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT, CONTENT_BUFFER, expectFsError, expectSameBuffer, useMockFs } from './utils/setup';

const FILEPATH = 'test.txt';

describe('readFile', () => {
  useMockFs();

  test.each([[undefined], [null]])('encoding: %p', async encoding => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(FILEPATH, encoding), CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(FILEPATH, { encoding }), CONTENT_BUFFER);
  });

  test.each([['ascii'], ['utf-8'], ['ucs-2'], ['latin1']])('encoding: %p', async encoding => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, Buffer.from(CONTENT, encoding));
    expect(await fs.readFile(FILEPATH, encoding)).toBe(CONTENT);
    expect(await fs.readFile(FILEPATH, { encoding })).toBe(CONTENT);
  });

  test('in dir', async () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    mock.createFile(filepath, CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(filepath), CONTENT_BUFFER);
  });

  test('not exist => ENOENT open', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.readFile('test.txt'), {
      code: 'ENOENT',
      syscall: 'open',
      message: "ENOENT: no such file or directory, open 'test.txt'",
    });
  });

  test('nested parent missing => ENOENT open', async () => {
    const fs = new FsaPromises();
    await expectFsError(fs.readFile('nodir/x.txt'), {
      code: 'ENOENT',
      syscall: 'open',
      message: "ENOENT: no such file or directory, open 'nodir/x.txt'",
    });
  });

  test('path is a directory => EISDIR read (no path in message)', async () => {
    const fs = new FsaPromises();
    mock.makeDir('dir1');
    await expectFsError(fs.readFile('dir1'), {
      code: 'EISDIR',
      syscall: 'read',
      message: 'EISDIR: illegal operation on a directory, read',
    });
  });

  test('parent is a file => ENOTDIR open', async () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    await expectFsError(fs.readFile(`${FILEPATH}/x.txt`), {
      code: 'ENOTDIR',
      syscall: 'open',
      message: `ENOTDIR: not a directory, open '${FILEPATH}/x.txt'`,
    });
  });
});
