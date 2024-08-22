# fsa-promises

Web [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) to Node fs promises API.

> [!NOTE]  
> This library was originally implemented for use with [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git). But the actual test found that the performance was so bad and there were inexplicable problems, so I gave up. ☹️

## Install

```bash
# npm
npm install @tsuk1ko/fsa-promises

# yarn
yarn add @tsuk1ko/fsa-promises

# bun
bun add @tsuk1ko/fsa-promises
```

## Usage

```ts
import { FsaPromises } from 'fsa-promises';

// Use `navigator.storage.getDirectory()` as root
const fs = new FsaPromises();

// Use directory "path/to/some/dir" of `navigator.storage.getDirectory()` as root,
// will be create recursively if not exists
const fs = new FsaPromises('path/to/some/dir');

// Use `showDirectoryPicker()` to select a directory as root
const fs = new FsaPromises(showDirectoryPicker({ mode: 'readwrite' }));

// Use almost the same way as node fsPromises module
await fs.writeFile('file.txt', 'hello world');
```

## APIs

### `new FsaPromises([options])`

`options` can be `string`, `FileSystemDirectoryHandle`, `Promise<FileSystemDirectoryHandle>` or an `FsaPromiseOptions` object.

```ts
interface FsaPromiseOptions {
  root?: string | FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>;
  useSyncAccessHandleForFile?: boolean;
}
```

#### `useSyncAccessHandleForFile`

When it is `true`, the library will use `createSyncAccessHandle()` instead of `createWritable()` to write file.

It is only usable inside dedicated Web Workers with the origin private file system.

For more information, please check [here](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle).

### `readFile(path[, options])`

Refer to [fsPromises.readFile](https://nodejs.org/api/fs.html#fspromisesreadfilepath-options).

`flag` and `signal` are not supported.

### `writeFile(file, data[, options])`

Refer to [fsPromises.writeFile](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options).

`mode` is not supported.

`flush` is usable only when `useSyncAccessHandleForFile` is `true`.

`signal` is not usable when `useSyncAccessHandleForFile` is `true`.

### `unlink(path)`

Refer to [fsPromises.unlink](https://nodejs.org/api/fs.html#fspromisesunlinkpath).

### `readdir(path[, options])`

Refer to [fsPromises.readdir](https://nodejs.org/api/fs.html#fspromisesreaddirpath-options).

`encoding` only support `undefine`, `null` or `"buffer"`.

### `mkdir(path[, options])`

Refer to [fsPromises.mkdir](https://nodejs.org/api/fs.html#fspromisesmkdirpath-options).

`mode` is not supported.

### `rmdir(path[, options])`

Refer to [fsPromises.rmdir](https://nodejs.org/api/fs.html#fspromisesrmdirpath-options).

`maxRetries` and `retryDelay` are not supported.

### `exist(path)`

This API does not exist in node fsPromises. It is provided for convenience.

### `stat(path[, options])`

Refer to [fsPromises.stat](https://nodejs.org/api/fs.html#fspromisesstatpath-options).

### `lstat(path[, options])`

Same as `stat()` because symlink isn't implemented.

### `readlink(path[, options])`

Not implemented, don't use.

### `symlink(target, path[, type])`

Not implemented, don't use.

### `chmod(path, mode)`

Do nothing, just for compatibility.
