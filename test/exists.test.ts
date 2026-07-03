import { describe, expect, test } from 'bun:test';
import { mock } from 'fsa-mock';
import { FsaPromises } from '../src';
import { CONTENT_BUFFER, useMockFs } from './utils/setup';

describe('exists', () => {
  useMockFs();

  test('file & dir', async () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    mock.createFile(filepath, CONTENT_BUFFER);
    expect(await fs.exists(filepath)).toBeTrue();
    expect(await fs.exists(dir)).toBeTrue();
    expect(await fs.exists('foo')).toBeTrue();
    expect(await fs.exists('foo/not-exist')).toBeFalse();
    expect(await fs.exists('not-exist')).toBeFalse();
  });

  test('root ("." / "") always exists', async () => {
    const fs = new FsaPromises();
    expect(await fs.exists('')).toBeTrue();
    expect(await fs.exists('.')).toBeTrue();
  });

  test('parent is a file => false', async () => {
    const fs = new FsaPromises();
    mock.createFile('file1', CONTENT_BUFFER);
    expect(await fs.exists('file1/x')).toBeFalse();
  });
});
