// Public SDK entry point. Import everything you need from here:
//   import { FileSystemSDK, createSeededSDK } from './sdk';

export { FileSystemSDK, default } from './FileSystemSDK.js';
export { ErrorCodes, FileSystemError } from './errors.js';
export { NodeType, ROOT_ID } from './TreeStore.js';

import { FileSystemSDK } from './FileSystemSDK.js';
import { ROOT_ID } from './TreeStore.js';

// Build an SDK pre-populated with the example structure from the task:
//
//   My Files
//   ├── Documents
//   │   ├── Resume.pdf
//   │   └── Project Plan.docx
//   ├── Images
//   │   ├── Photo.png
//   │   └── Logo.svg
//   └── Notes.txt
//
// We seed inside a single transaction so the initial state is not pushed as a
// bunch of individual undo entries (and we then clear history so the user
// starts with an empty undo stack).
export function createSeededSDK() {
  const sdk = new FileSystemSDK({ rootName: 'My Files' });
  sdk.transaction((tx) => {
    const documents = tx.createFolder(ROOT_ID, 'Documents');
    tx.createFile(documents.id, 'Resume.pdf');
    tx.createFile(documents.id, 'Project Plan.docx');
    const images = tx.createFolder(ROOT_ID, 'Images');
    tx.createFile(images.id, 'Photo.png');
    tx.createFile(images.id, 'Logo.svg');
    tx.createFile(ROOT_ID, 'Notes.txt');
  }, { label: 'Seed initial file system' });
  // Fresh start: nothing to undo.
  sdk._history.clear();
  return sdk;
}
