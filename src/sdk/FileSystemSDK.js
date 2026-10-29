// FileSystemSDK — the public, framework-agnostic API.
//
// This is the only object consumers (React or plain JS) interact with. It
// wires together the TreeStore (source of truth), the primitive operations,
// the History (undo/redo), and the EventEmitter (change notifications).
//
// Design principles
// -----------------
//  * The SDK is the single source of truth. It does not depend on React.
//  * Every public mutation goes through `#commit`, which runs one or more
//    primitive ops ATOMICALLY: if any op throws, all already-applied ops in
//    the same batch are rolled back via their inverses, so the store is never
//    left half-changed. Only on success do we record history and notify.
//  * Reads return deep-frozen snapshots, never internal nodes.

import { TreeStore, ROOT_ID, NodeType } from './TreeStore.js';
import { EventEmitter } from './EventEmitter.js';
import { History } from './History.js';
import { createIdFactory } from './ids.js';
import { searchItems } from './search.js';
import {
  opCreate,
  opRename,
  opMove,
  opDeleteSubtree,
} from './operations.js';
import { FileSystemError, ErrorCodes } from './errors.js';

export { FileSystemError, ErrorCodes, NodeType, ROOT_ID };

export class FileSystemSDK {
  constructor({ rootName = 'My Files' } = {}) {
    this._store = new TreeStore(rootName);
    this._emitter = new EventEmitter();
    this._history = new History();
    this._nextId = createIdFactory('node');
    // When >0 we are inside a transaction and must NOT record per-op history
    // or emit; the transaction handles both once, on commit.
    this._txDepth = 0;
  }

  // ---- Change notifications ---------------------------------------------

  // Register a listener for change events. Returns an unsubscribe function.
  // Payload: { type, ...details }. Consumers typically just re-read getTree().
  subscribe(listener) {
    return this._emitter.subscribe(listener);
  }

  _emit(payload) {
    if (this._txDepth === 0) this._emitter.emit(payload);
  }

  get listenerCount() {
    return this._emitter.size;
  }

  // ---- Reads (always immutable snapshots) -------------------------------

  // Full hierarchy as a nested, frozen tree.
  getTree() {
    return this._store.toTree();
  }

  // Find a single item by id. `deep:true` includes nested children.
  getItem(id, { deep = false } = {}) {
    return this._store.toItem(id, { deep });
  }

  // Does an item exist?
  exists(id) {
    return this._store.has(id);
  }

  // Path (array of names, root -> item) for an item.
  getPath(id) {
    if (!this._store.has(id)) throw this._store.getNode(id); // throws NOT_FOUND
    return this._store.pathOf(id);
  }

  // ---- Core internal commit engine --------------------------------------
  //
  // Runs `applied = factory()` where factory performs one or more primitive
  // ops and returns an array of their results (each with an `inverse`). If the
  // factory throws, we roll back any ops that already succeeded, in reverse
  // order, and re-throw — leaving the store exactly as it started.
  //
  // On success (and when not nested inside a transaction) we push a single
  // history entry and emit one change event.
  #commit(label, factory) {
    const applied = [];
    try {
      factory(applied);
    } catch (e) {
      // Roll back already-applied primitives (reverse order) to guarantee
      // the store is never left in a partial / inconsistent state.
      for (let i = applied.length - 1; i >= 0; i--) {
        try {
          applied[i].inverse();
        } catch {
          /* best-effort rollback */
        }
      }
      throw e;
    }

    // Build an undo/redo entry whose do()/undo() flip the whole batch.
    // Each primitive result has an `inverse()` that, when called, reverts the
    // change AND returns a fresh op-result whose own `inverse()` re-applies it.
    // So to toggle a batch we call inverse() on each and REPLACE the stored
    // result with the returned one. undo walks newest->oldest; do oldest->newest.
    const entry = {
      label,
      undo: () => {
        for (let i = applied.length - 1; i >= 0; i--) {
          applied[i] = applied[i].inverse();
        }
      },
      do: () => {
        for (let i = 0; i < applied.length; i++) {
          applied[i] = applied[i].inverse();
        }
      },
    };

    if (this._txDepth === 0) {
      this._history.push(entry);
      this._emit({ type: 'change', action: label });
    }
    return { entry, applied };
  }

  // ---- Public mutations --------------------------------------------------

  // Create a file inside `parentId`. Returns the created item snapshot.
  createFile(parentId, name) {
    const id = this._nextId();
    this.#commit(`Create file "${name}"`, (applied) => {
      applied.push(
        opCreate(this._store, { id, name, type: NodeType.FILE, parentId })
      );
    });
    return this.getItem(id);
  }

  // Create a folder inside `parentId`. Returns the created item snapshot.
  createFolder(parentId, name) {
    const id = this._nextId();
    this.#commit(`Create folder "${name}"`, (applied) => {
      applied.push(
        opCreate(this._store, { id, name, type: NodeType.FOLDER, parentId })
      );
    });
    return this.getItem(id);
  }

  // Rename an item. Returns the updated item snapshot.
  rename(id, newName) {
    this.#commit(`Rename to "${newName}"`, (applied) => {
      applied.push(opRename(this._store, { id, name: newName }));
    });
    return this.getItem(id);
  }

  // Move an item into another folder. Returns the moved item snapshot.
  move(id, targetParentId) {
    this.#commit(`Move item`, (applied) => {
      applied.push(opMove(this._store, { id, targetParentId }));
    });
    return this.getItem(id);
  }

  // Delete an item (and all descendants if it is a folder). Returns true.
  delete(id) {
    this.#commit(`Delete item`, (applied) => {
      applied.push(opDeleteSubtree(this._store, { id }));
    });
    return true;
  }

  // ---- Search ------------------------------------------------------------
  search(options) {
    return searchItems(this._store, options);
  }

  // ---- Undo / redo -------------------------------------------------------
  undo() {
    const entry = this._history.undo();
    if (entry) this._emit({ type: 'change', action: `Undo: ${entry.label}` });
    return Boolean(entry);
  }

  redo() {
    const entry = this._history.redo();
    if (entry) this._emit({ type: 'change', action: `Redo: ${entry.label}` });
    return Boolean(entry);
  }

  canUndo() {
    return this._history.canUndo();
  }

  canRedo() {
    return this._history.canRedo();
  }

  historyState() {
    return this._history.describe();
  }

  // ---- Bonus: atomic transactions ---------------------------------------
  //
  // Run multiple operations as a single unit. The callback receives a `tx`
  // object exposing the same mutation methods. All ops succeed together or
  // none are applied. On success we record ONE undo entry for the whole
  // transaction and emit a single change event. On failure everything is
  // rolled back and no history entry / event is produced.
  //
  // Usage:
  //   sdk.transaction((tx) => {
  //     const f = tx.createFolder(root, 'A');
  //     tx.createFile(f.id, 'a.txt');
  //   });
  transaction(callback, { label = 'Transaction' } = {}) {
    if (typeof callback !== 'function') {
      throw new FileSystemError(
        ErrorCodes.INVALID_ARGUMENT,
        'transaction(callback) requires a function.'
      );
    }

    const applied = [];
    const tx = this.#makeTxApi(applied);

    this._txDepth++;
    try {
      callback(tx);
    } catch (e) {
      // Roll back everything applied so far, newest first.
      for (let i = applied.length - 1; i >= 0; i--) {
        try {
          applied[i].inverse();
        } catch {
          /* best-effort */
        }
      }
      this._txDepth--;
      throw e instanceof FileSystemError
        ? e
        : new FileSystemError(ErrorCodes.TRANSACTION_FAILED, e.message);
    }
    this._txDepth--;

    // Commit: one history entry, one event.
    const entry = {
      label,
      undo: () => {
        for (let i = applied.length - 1; i >= 0; i--) {
          applied[i] = applied[i].inverse();
        }
      },
      do: () => {
        for (let i = 0; i < applied.length; i++) {
          applied[i] = applied[i].inverse();
        }
      },
    };
    this._history.push(entry);
    this._emit({ type: 'change', action: label });
    return true;
  }

  // Internal: a mutation API that records primitives into `applied` instead
  // of committing them individually. Shares validation with public methods.
  #makeTxApi(applied) {
    const store = this._store;
    const nextId = this._nextId;
    return {
      createFile: (parentId, name) => {
        const id = nextId();
        applied.push(opCreate(store, { id, name, type: NodeType.FILE, parentId }));
        return store.toItem(id);
      },
      createFolder: (parentId, name) => {
        const id = nextId();
        applied.push(opCreate(store, { id, name, type: NodeType.FOLDER, parentId }));
        return store.toItem(id);
      },
      rename: (id, name) => {
        applied.push(opRename(store, { id, name }));
        return store.toItem(id);
      },
      move: (id, targetParentId) => {
        applied.push(opMove(store, { id, targetParentId }));
        return store.toItem(id);
      },
      delete: (id) => {
        applied.push(opDeleteSubtree(store, { id }));
        return true;
      },
    };
  }

  // Convenience: bulk-delete several ids as a single atomic transaction.
  deleteMany(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new FileSystemError(
        ErrorCodes.INVALID_ARGUMENT,
        'deleteMany(ids) requires a non-empty array of ids.'
      );
    }
    // Keep only "top-level" ids: an id is dropped if some OTHER id in the
    // list is its ancestor, because deleting the ancestor already removes it.
    // This prevents a transaction from trying to delete an already-removed
    // child (which would throw and roll back the whole bulk delete).
    const unique = Array.from(new Set(ids));
    const topLevel = unique.filter(
      (id) =>
        !unique.some(
          (other) =>
            other !== id &&
            this._store.has(other) &&
            this._store.has(id) &&
            this._store.isDescendantOrSelf(id, other)
        )
    );
    this.transaction(
      (tx) => {
        for (const id of topLevel) tx.delete(id);
      },
      { label: `Delete ${topLevel.length} item(s)` }
    );
    return true;
  }
}

export default FileSystemSDK;
