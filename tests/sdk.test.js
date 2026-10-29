// SDK unit tests — cover success paths AND important failure scenarios, as
// required by the task (section 5).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileSystemSDK, ROOT_ID } from '../src/sdk/index.js';

function makeSdk() {
  return new FileSystemSDK({ rootName: 'My Files' });
}

describe('TreeStore / basic CRUD', () => {
  let sdk;
  beforeEach(() => {
    sdk = makeSdk();
  });

  it('creates files and folders inside a folder', () => {
    const docs = sdk.createFolder(ROOT_ID, 'Documents');
    const file = sdk.createFile(docs.id, 'Resume.pdf');
    expect(docs.type).toBe('folder');
    expect(file.type).toBe('file');
    const tree = sdk.getTree();
    expect(tree.children.map((c) => c.name)).toContain('Documents');
  });

  it('retrieves an item by id and reports existence', () => {
    const f = sdk.createFolder(ROOT_ID, 'A');
    expect(sdk.exists(f.id)).toBe(true);
    expect(sdk.getItem(f.id).name).toBe('A');
    expect(sdk.exists('missing')).toBe(false);
  });

  it('renames an item while preserving its identity (same id)', () => {
    const f = sdk.createFile(ROOT_ID, 'old.txt');
    const renamed = sdk.rename(f.id, 'new.txt');
    expect(renamed.id).toBe(f.id);
    expect(sdk.getItem(f.id).name).toBe('new.txt');
  });

  it('moves an item preserving its identity', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const b = sdk.createFolder(ROOT_ID, 'B');
    const file = sdk.createFile(a.id, 'f.txt');
    sdk.move(file.id, b.id);
    expect(sdk.getItem(file.id).parentId).toBe(b.id);
    expect(sdk.getItem(file.id).id).toBe(file.id);
  });

  it('deletes a folder and all descendants', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const sub = sdk.createFolder(a.id, 'Sub');
    const file = sdk.createFile(sub.id, 'deep.txt');
    sdk.delete(a.id);
    expect(sdk.exists(a.id)).toBe(false);
    expect(sdk.exists(sub.id)).toBe(false);
    expect(sdk.exists(file.id)).toBe(false);
  });
});

describe('Validation / failure scenarios', () => {
  let sdk;
  beforeEach(() => {
    sdk = makeSdk();
  });

  it('rejects duplicate names within the same folder (case-insensitive)', () => {
    sdk.createFile(ROOT_ID, 'Notes.txt');
    expect(() => sdk.createFile(ROOT_ID, 'notes.TXT')).toThrowError(/already exists/i);
  });

  it('allows the same name in different folders', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const b = sdk.createFolder(ROOT_ID, 'B');
    expect(() => {
      sdk.createFile(a.id, 'same.txt');
      sdk.createFile(b.id, 'same.txt');
    }).not.toThrow();
  });

  it('rejects creating items inside a file', () => {
    const file = sdk.createFile(ROOT_ID, 'f.txt');
    expect(() => sdk.createFile(file.id, 'x.txt')).toThrowError(/file/i);
  });

  it('prevents moving a folder into itself', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    expect(() => sdk.move(a.id, a.id)).toThrowError(/itself|descendant/i);
  });

  it('prevents moving a folder into one of its descendants', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const sub = sdk.createFolder(a.id, 'Sub');
    expect(() => sdk.move(a.id, sub.id)).toThrowError(/itself|descendant/i);
  });

  it('rejects empty names', () => {
    expect(() => sdk.createFile(ROOT_ID, '   ')).toThrowError(/non-empty/i);
  });

  it('throws NOT_FOUND for unknown ids and does not corrupt state', () => {
    const before = sdk.getTree().children.length;
    expect(() => sdk.rename('nope', 'x')).toThrowError(/No item found/i);
    expect(sdk.getTree().children.length).toBe(before);
  });

  it('does not create an undo entry for a failed operation', () => {
    sdk.createFile(ROOT_ID, 'a.txt');
    expect(() => sdk.createFile(ROOT_ID, 'A.TXT')).toThrow();
    // Only the one successful create should be undoable.
    sdk.undo();
    expect(sdk.canUndo()).toBe(false);
  });
});

describe('Immutability', () => {
  it('returned snapshots cannot mutate internal state', () => {
    const sdk = makeSdk();
    sdk.createFolder(ROOT_ID, 'A');
    const tree = sdk.getTree();
    expect(() => tree.children.push({ id: 'x' })).toThrow();
    expect(() => {
      tree.name = 'hacked';
    }).toThrow();
    expect(sdk.getTree().children.length).toBe(1);
  });
});

describe('Search', () => {
  let sdk, docs, imgs;
  beforeEach(() => {
    sdk = makeSdk();
    docs = sdk.createFolder(ROOT_ID, 'Documents');
    imgs = sdk.createFolder(ROOT_ID, 'Images');
    sdk.createFile(docs.id, 'Resume.pdf');
    sdk.createFile(docs.id, 'Report.docx');
    sdk.createFile(imgs.id, 'photo.png');
  });

  it('is case-insensitive and searches nested items', () => {
    const r = sdk.search({ query: 'RE' });
    const names = r.results.map((x) => x.name).sort();
    expect(names).toEqual(['Report.docx', 'Resume.pdf']);
  });

  it('filters by type', () => {
    const r = sdk.search({ query: 'o', type: 'folder' });
    expect(r.results.every((x) => x.type === 'folder')).toBe(true);
  });

  it('returns empty for empty queries', () => {
    expect(sdk.search({ query: '   ' }).total).toBe(0);
  });

  it('throws on invalid search options', () => {
    expect(() => sdk.search({ query: 'a', type: 'banana' })).toThrowError(/Invalid type/i);
    expect(() => sdk.search({ query: 'a', page: 0 })).toThrowError(/positive integer/i);
  });

  it('supports sorting and pagination', () => {
    const page1 = sdk.search({ query: 'r', sortBy: 'name', sortDir: 'asc', page: 1, pageSize: 1 });
    expect(page1.pageSize).toBe(1);
    expect(page1.results.length).toBe(1);
    expect(page1.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('reflects changes made to the file system', () => {
    expect(sdk.search({ query: 'brandnew' }).total).toBe(0);
    sdk.createFile(docs.id, 'brandnew.txt');
    expect(sdk.search({ query: 'brandnew' }).total).toBe(1);
  });

  it('includes name, type and location in results', () => {
    const r = sdk.search({ query: 'Resume' });
    const item = r.results[0];
    expect(item).toMatchObject({ name: 'Resume.pdf', type: 'file' });
    expect(item.pathString).toBe('My Files / Documents / Resume.pdf');
  });
});

describe('Undo / redo', () => {
  let sdk;
  beforeEach(() => {
    sdk = makeSdk();
  });

  it('undoes and redoes a create', () => {
    const f = sdk.createFile(ROOT_ID, 'a.txt');
    expect(sdk.exists(f.id)).toBe(true);
    sdk.undo();
    expect(sdk.exists(f.id)).toBe(false);
    sdk.redo();
    expect(sdk.exists(f.id)).toBe(true);
  });

  it('undoes a rename and a move', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const b = sdk.createFolder(ROOT_ID, 'B');
    const file = sdk.createFile(a.id, 'f.txt');
    sdk.rename(file.id, 'g.txt');
    sdk.undo();
    expect(sdk.getItem(file.id).name).toBe('f.txt');

    sdk.move(file.id, b.id);
    expect(sdk.getItem(file.id).parentId).toBe(b.id);
    sdk.undo();
    expect(sdk.getItem(file.id).parentId).toBe(a.id);
  });

  it('restores a deleted folder with its complete nested structure', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const sub = sdk.createFolder(a.id, 'Sub');
    const file = sdk.createFile(sub.id, 'deep.txt');
    sdk.delete(a.id);
    sdk.undo();
    expect(sdk.exists(a.id)).toBe(true);
    expect(sdk.exists(sub.id)).toBe(true);
    expect(sdk.exists(file.id)).toBe(true);
    expect(sdk.getItem(file.id).name).toBe('deep.txt');
  });

  it('clears redo history when a new operation is performed after undo', () => {
    const a = sdk.createFile(ROOT_ID, 'a.txt');
    sdk.undo();
    expect(sdk.canRedo()).toBe(true);
    sdk.createFile(ROOT_ID, 'b.txt');
    expect(sdk.canRedo()).toBe(false);
  });

  it('reports history labels', () => {
    sdk.createFolder(ROOT_ID, 'X');
    const state = sdk.historyState();
    expect(state.canUndo).toBe(true);
    expect(state.nextUndoLabel).toMatch(/Create folder "X"/);
  });
});

describe('Subscriptions', () => {
  it('notifies subscribers on change and supports unsubscribe', () => {
    const sdk = makeSdk();
    const listener = vi.fn();
    const unsubscribe = sdk.subscribe(listener);
    sdk.createFile(ROOT_ID, 'a.txt');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    sdk.createFile(ROOT_ID, 'b.txt');
    expect(listener).toHaveBeenCalledTimes(1); // not called again
    expect(sdk.listenerCount).toBe(0);
  });

  it('supports multiple independent subscribers', () => {
    const sdk = makeSdk();
    const a = vi.fn();
    const b = vi.fn();
    sdk.subscribe(a);
    const offB = sdk.subscribe(b);
    sdk.createFile(ROOT_ID, 'x.txt');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offB();
    sdk.createFile(ROOT_ID, 'y.txt');
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('Transactions (bonus)', () => {
  let sdk;
  beforeEach(() => {
    sdk = makeSdk();
  });

  it('commits all operations together and notifies once', () => {
    const listener = vi.fn();
    sdk.subscribe(listener);
    sdk.transaction((tx) => {
      const a = tx.createFolder(ROOT_ID, 'A');
      tx.createFile(a.id, 'a.txt');
      tx.createFile(a.id, 'b.txt');
    });
    expect(listener).toHaveBeenCalledTimes(1); // single event for the whole tx
    expect(sdk.search({ query: '.txt' }).total).toBe(2);
  });

  it('rolls back completely on failure and creates no history entry', () => {
    sdk.createFile(ROOT_ID, 'exists.txt');
    sdk._history.clear(); // ignore the setup create for this assertion
    const listener = vi.fn();
    sdk.subscribe(listener);
    const before = sdk.getTree().children.length;
    expect(() =>
      sdk.transaction((tx) => {
        tx.createFolder(ROOT_ID, 'Temp');
        tx.createFile(ROOT_ID, 'exists.txt'); // duplicate -> throws
      })
    ).toThrow();
    expect(sdk.getTree().children.length).toBe(before); // no partial changes
    expect(listener).not.toHaveBeenCalled(); // no event on failure
    expect(sdk.canUndo()).toBe(false); // no undo entry from the failed tx
  });

  it('treats a successful transaction as one undoable operation', () => {
    sdk.transaction((tx) => {
      const a = tx.createFolder(ROOT_ID, 'A');
      tx.createFile(a.id, 'a.txt');
    });
    sdk.undo();
    expect(sdk.getTree().children.length).toBe(0);
    sdk.redo();
    expect(sdk.getTree().children.length).toBe(1);
  });

  it('deleteMany removes multiple items atomically as one undo entry', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const b = sdk.createFolder(ROOT_ID, 'B');
    sdk.createFile(a.id, 'x.txt');
    sdk.deleteMany([a.id, b.id]);
    expect(sdk.exists(a.id)).toBe(false);
    expect(sdk.exists(b.id)).toBe(false);
    sdk.undo();
    expect(sdk.exists(a.id)).toBe(true);
    expect(sdk.exists(b.id)).toBe(true);
  });

  it('deleteMany ignores descendants already covered by an ancestor in the list', () => {
    const a = sdk.createFolder(ROOT_ID, 'A');
    const sub = sdk.createFolder(a.id, 'Sub');
    // Passing both the folder and its descendant must not throw.
    expect(() => sdk.deleteMany([a.id, sub.id])).not.toThrow();
    expect(sdk.exists(a.id)).toBe(false);
  });
});
