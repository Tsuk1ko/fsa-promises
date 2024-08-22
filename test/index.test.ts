import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { mock } from 'fsa-mock';
import { Buffer } from 'buffer/';
import { type Dirent, FsaPromises } from '../src';

(self.navigator as any).storage = {
  getDirectory: () => showDirectoryPicker({ mode: 'readwrite' }),
};

beforeEach(() => {
  mock.install();
});

afterEach(() => {
  mock.uninstall();
});

const FILEPATH = 'test.txt';
const CONTENT = 'hello word';
const CONTENT_BUFFER = Buffer.from(CONTENT);

const expectSameBuffer = (a: Buffer, b: Buffer) => expect(a.compare(b)).toBe(0);

describe('readFile', () => {
  test.each([[undefined], [null]])('encoding: %p', async encoding => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(FILEPATH, encoding), CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(FILEPATH, { encoding }), CONTENT_BUFFER);
  });

  test.each([['ascii'], ['utf-8'], ['ucs-2'], ['latin1']])('encoding: %p', encoding => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, Buffer.from(CONTENT, encoding));
    expect(fs.readFile(FILEPATH, encoding)).resolves.toBe(CONTENT);
    expect(fs.readFile(FILEPATH, { encoding })).resolves.toBe(CONTENT);
  });

  test('in dir', async () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    mock.createFile(filepath, CONTENT_BUFFER);
    expectSameBuffer(await fs.readFile(filepath), CONTENT_BUFFER);
  });

  test('not exist', () => {
    const fs = new FsaPromises();
    expect(fs.readFile('test.txt')).rejects.toBeTruthy();
  });
});

describe('writeFile', () => {
  test.each([[undefined], [null]])('encoding: %p', encoding => {
    const fs = new FsaPromises();
    expect(fs.writeFile(FILEPATH, CONTENT, encoding)).resolves.toBeUndefined();
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), CONTENT_BUFFER);
  });

  test.each([['ascii'], ['utf-8'], ['ucs-2'], ['latin1']])('encoding: %p', encoding => {
    const fs = new FsaPromises();
    expect(fs.writeFile(FILEPATH, CONTENT, encoding)).resolves.toBeUndefined();
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), Buffer.from('hello word', encoding));
  });

  test('flag: "a"', () => {
    const fs = new FsaPromises();
    const content1 = Buffer.from('abc');
    const content2 = Buffer.from('123');
    mock.createFile(FILEPATH, content1);
    expect(fs.writeFile(FILEPATH, content2, { flag: 'a' })).resolves.toBeUndefined();
    expectSameBuffer(Buffer.from(mock.contents(FILEPATH)!), Buffer.concat([content1, content2]));
  });

  test('flag: "x"', () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    expect(fs.writeFile(FILEPATH, CONTENT_BUFFER, { flag: 'x' })).rejects.toBeTruthy();
  });

  test('overwrite', async () => {
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
});

describe('unlink', () => {
  test('file in root', () => {
    const fs = new FsaPromises();
    mock.createFile(FILEPATH, CONTENT_BUFFER);
    expect(mock.exists(FILEPATH)).toBeTruthy();
    expect(fs.unlink(FILEPATH)).resolves.toBeUndefined();
    expect(mock.exists(FILEPATH)).toBeFalsy();
  });

  test('file in dir', () => {
    const fs = new FsaPromises();
    const dir = 'foo/bar';
    const filepath = `${dir}/test.txt`;
    mock.makeDir(dir);
    mock.createFile(filepath, CONTENT_BUFFER);
    expect(mock.exists(filepath)).toBeTruthy();
    expect(fs.unlink(filepath)).resolves.toBeUndefined();
    expect(mock.exists(filepath)).toBeFalsy();
  });

  test('not exist', () => {
    const fs = new FsaPromises();
    expect(fs.unlink(FILEPATH)).rejects.toBeTruthy();
  });

  test('dir', () => {
    const fs = new FsaPromises();
    expect(fs.unlink('.')).rejects.toBeTruthy();
    const dir = 'foo/bar';
    mock.makeDir(dir);
    expect(mock.exists(dir)).toBeTruthy();
    expect(fs.unlink(dir)).rejects.toBeTruthy();
  });
});

describe('readdir', () => {
  beforeEach(() => {
    mock.makeDir('dir1');
    mock.makeDir('dir2/dir1');
    mock.makeDir('dir2/dir2');
    mock.createFile('file1');
    mock.createFile('file2');
    mock.createFile('dir1/file1');
    mock.createFile('dir2/dir1/file1');
  });

  test('recursive: false', () => {
    const fs = new FsaPromises();
    expect(fs.readdir('.')).resolves.toEqual(['dir1', 'dir2', 'file1', 'file2']);
    expect(fs.readdir('dir1')).resolves.toEqual(['file1']);
    expect(fs.readdir('dir2')).resolves.toEqual(['dir1', 'dir2']);
    expect(fs.readdir('dir2/dir1')).resolves.toEqual(['file1']);
    expect(fs.readdir('dir2/dir2')).resolves.toEqual([]);
  });

  test('recursive: true', () => {
    const fs = new FsaPromises();
    expect(fs.readdir('.', { recursive: true })).resolves.toEqual([
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

  test('not exist or is file', () => {
    const fs = new FsaPromises();
    expect(fs.readdir('not-exist')).rejects.toBeTruthy();
    expect(fs.readdir('dir1/not-exist')).rejects.toBeTruthy();
    expect(fs.readdir('file1')).rejects.toBeTruthy();
    expect(fs.readdir('dir1/file1')).rejects.toBeTruthy();
  });
});

describe('mkdir', () => {
  test('recursive: false', () => {
    const fs = new FsaPromises();
    expect(fs.mkdir('.')).rejects.toBeTruthy();
    expect(fs.mkdir('dir1')).resolves.toBeUndefined();
    expect(fs.mkdir('dir1')).rejects.toBeTruthy();
    expect(fs.mkdir('dir1/dir2')).resolves.toBeUndefined();
    expect(fs.mkdir('dir1/dir2')).rejects.toBeTruthy();
    expect(fs.mkdir('dir2/dir1')).rejects.toBeTruthy();
  });

  test('recursive: true', () => {
    const fs = new FsaPromises();
    expect(fs.mkdir('dir1/dir2', { recursive: true })).resolves.toBeString();
    expect(fs.mkdir('dir1/dir2', { recursive: true })).resolves.toBeString();
    expect(fs.mkdir('dir1', { recursive: true })).resolves.toBeString();
    expect(fs.mkdir('.', { recursive: true })).resolves.toBeString();
  });
});

describe('rmdir', () => {
  beforeEach(() => {
    mock.makeDir('dir1');
    mock.makeDir('dir2/dir1');
    mock.makeDir('dir2/dir2');
    mock.createFile('file1');
    mock.createFile('file2');
    mock.createFile('dir2/dir1/file1');
  });

  test('recursive: false', () => {
    const fs = new FsaPromises();

    expect(fs.rmdir('.')).rejects.toBeTruthy();
    expect(fs.rmdir('dir2')).rejects.toBeTruthy();
    expect(fs.rmdir('not-exist')).rejects.toBeTruthy();

    expect(mock.exists('dir1')).toBeTrue();
    expect(fs.rmdir('dir1')).resolves.toBeUndefined();
    expect(mock.exists('dir1')).toBeFalse();

    expect(mock.exists('dir2/dir2')).toBeTrue();
    expect(fs.rmdir('dir2/dir2')).resolves.toBeUndefined();
    expect(mock.exists('dir2/dir2')).toBeFalse();
  });

  test('recursive: true', () => {
    const fs = new FsaPromises();

    expect(fs.rmdir('.', { recursive: true })).rejects.toBeTruthy();
    expect(fs.rmdir('not-exist', { recursive: true })).rejects.toBeTruthy();

    expect(mock.exists('dir1')).toBeTrue();
    expect(fs.rmdir('dir1', { recursive: true })).resolves.toBeUndefined();
    expect(mock.exists('dir1')).toBeFalse();

    expect(mock.exists('dir2')).toBeTrue();
    expect(fs.rmdir('dir2', { recursive: true })).resolves.toBeUndefined();
    expect(mock.exists('dir2')).toBeFalse();
  });
});

describe('stat', () => {
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

  test('not exist', () => {
    const fs = new FsaPromises();
    expect(fs.stat('not-exist')).rejects.toBeTruthy();
    expect(fs.stat('dir1/not-exist')).rejects.toBeTruthy();
  });
});
