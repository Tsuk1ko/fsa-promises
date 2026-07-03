import { Buffer } from 'buffer/';
import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT, CONTENT_BUFFER, expectFsError, expectSameBuffer, useMockFs } from './utils/setup';

const FILEPATH = 'test.txt';

describe('writeFile', () => {
  useMockFs();

  test.each([[undefined], [null]])('encoding: %p', async encoding => {
    const fs = new FsaPromises();
    expect(await fs.writeFile(FILEPATH, CONTENT, encoding)).toBeUndefined();
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), CONTENT_BUFFER);
  });

  test.each([['ascii'], ['utf-8'], ['ucs-2'], ['latin1']])('encoding: %p', async encoding => {
    const fs = new FsaPromises();
    await fs.writeFile(FILEPATH, CONTENT, encoding);
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), Buffer.from('hello word', encoding));
  });

  test('flag: "a" (append)', async () => {
    const fs = new FsaPromises();
    const content1 = Buffer.from('abc');
    const content2 = Buffer.from('123');
    mock.createFile(FILEPATH, content1);
    await fs.writeFile(FILEPATH, content2, { flag: 'a' });
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), Buffer.concat([content1, content2]));
  });

  test('flag: "x" on existing => EEXIST', async () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    await expectFsError(fs.writeFile(FILEPATH, CONTENT_BUFFER, { flag: 'x' }), {
      code: 'EEXIST',
      syscall: 'open',
    });
  });

  test('overwrite truncates old content', async () => {
    const fs = new FsaPromises();
    const content1 = Buffer.from('abc123');
    const content2 = Buffer.from('123');
    mock.createFile(FILEPATH, content1);
    await fs.writeFile(FILEPATH, content2);
    expectSameBuffer(await fs.readFile(FILEPATH), content2);
  });

  test('in dir', async () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    await fs.writeFile(filepath, CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(filepath), CONTENT_BUFFER);
  });

  test('target is a directory => EISDIR open', async () => {
    const fs = new FsaPromises();
    mock.makeDir('dir1');
    await expectFsError(fs.writeFile('dir1', CONTENT_BUFFER), {
      code: 'EISDIR',
      syscall: 'open',
      message: "EISDIR: illegal operation on a directory, open 'dir1'",
    });
  });

  test('parent is a file => ENOTDIR open', async () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    await expectFsError(fs.writeFile(`${FILEPATH}/x.txt`, CONTENT_BUFFER), {
      code: 'ENOTDIR',
      syscall: 'open',
    });
  });

  describe('ensureDir', () => {
    test('false (default) => ENOENT open', async () => {
      const fs = new FsaPromises();
      const filepath = 'foo/bar/test.txt';
      await expectFsError(fs.writeFile(filepath, CONTENT_BUFFER), {
        code: 'ENOENT',
        syscall: 'open',
      });
      expect(mock.exists(filepath)).toBeFalse();
    });

    test('true creates dirs recursively', async () => {
      const fs = new FsaPromises();
      const filepath = 'foo/bar/test.txt';
      await fs.writeFile(filepath, CONTENT_BUFFER, { ensureDir: true });
      expect(mock.exists(filepath)).toBeTrue();
      expectSameBuffer(await fs.readFile(filepath), CONTENT_BUFFER);
    });
  });

  describe('AbortSignal', () => {
    test('pre-aborted signal rejects before writing', async () => {
      const fs = new FsaPromises();
      const controller = new AbortController();
      controller.abort();
      expect(
        fs.writeFile(FILEPATH, CONTENT_BUFFER, { signal: controller.signal }),
      ).rejects.toThrow();
      expect(mock.exists(FILEPATH)).toBeFalse();
    });
  });

  describe('useSyncAccessHandleForFile', () => {
    test('overwrite truncates residual bytes', async () => {
      const fs = new FsaPromises({ useSyncAccessHandleForFile: true });
      await fs.writeFile(FILEPATH, Buffer.from('secret-token'), { flush: true });
      await fs.writeFile(FILEPATH, Buffer.from('ok'), { flush: true });
      expectSameBuffer(await fs.readFile(FILEPATH), Buffer.from('ok'));
    });

    test('append', async () => {
      const fs = new FsaPromises({ useSyncAccessHandleForFile: true });
      await fs.writeFile(FILEPATH, Buffer.from('abc'), { flush: true });
      await fs.writeFile(FILEPATH, Buffer.from('123'), { flag: 'a', flush: true });
      expectSameBuffer(await fs.readFile(FILEPATH), Buffer.from('abc123'));
    });
  });
});
