// TreeStore — the in-memory source of truth for the file system.
//
// Data model
// ----------
// We store every node in a flat `Map<id, node>` instead of a deeply nested
// object. Each node records its own `parentId`, and folders record an ordered
// `childIds` array. This "adjacency map" representation gives us:
//   * O(1) lookup of any item by id (getItem)
//   * cheap move/rename (only touch a few nodes)
//   * easy descendant traversal (follow childIds)
//
// A single synthetic ROOT node (id = 'root') is always present and acts as the
// top-level container ("My Files").
//
// Immutability
// ------------
// The internal `nodes` map is never handed to consumers. Instead we build
// *fresh, deeply-cloned* nested snapshots on demand (toTree / toItem). This
// satisfies the rule "data returned by the SDK must not allow consumers to
// modify its internal state directly" — mutating a snapshot has no effect on
// the store.

import { err, ErrorCodes } from './errors.js';
import { sameName } from './ids.js';

export const ROOT_ID = 'root';
export const NodeType = Object.freeze({ FILE: 'file', FOLDER: 'folder' });

export class TreeStore {
  constructor(rootName = 'My Files') {
    /** @type {Map<string, {id,name,type,parentId,childIds}>} */
    this.nodes = new Map();
    this.nodes.set(ROOT_ID, {
      id: ROOT_ID,
      name: rootName,
      type: NodeType.FOLDER,
      parentId: null,
      childIds: [],
    });
  }

  has(id) {
    return this.nodes.has(id);
  }

  // Internal accessor. Throws a meaningful error if the id is unknown.
  getNode(id) {
    const node = this.nodes.get(id);
    if (!node) throw err.notFound(id);
    return node;
  }

  getFolder(id) {
    const node = this.getNode(id);
    if (node.type !== NodeType.FOLDER) throw err.notAFolder(node.name);
    return node;
  }

  // ---- Validation helpers -------------------------------------------------

  // Rule: names must be unique within the same folder, ignoring case.
  // `exceptId` lets rename/move ignore the item being changed.
  assertNameAvailable(parentId, name, exceptId = null) {
    const parent = this.getFolder(parentId);
    for (const childId of parent.childIds) {
      if (childId === exceptId) continue;
      const child = this.nodes.get(childId);
      if (child && sameName(child.name, name)) {
        throw err.duplicateName(name, parent.name);
      }
    }
  }

  assertValidName(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw err.invalidArg('Name must be a non-empty string.');
    }
  }

  // Rule: a folder cannot be moved inside itself or any of its descendants.
  isDescendantOrSelf(candidateId, maybeAncestorId) {
    let current = candidateId;
    while (current != null) {
      if (current === maybeAncestorId) return true;
      const node = this.nodes.get(current);
      current = node ? node.parentId : null;
    }
    return false;
  }

  // Collect an id plus all of its descendants (depth-first). Used by delete
  // so we can remove/restore an entire subtree atomically.
  collectSubtreeIds(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      out.push(current);
      const node = this.nodes.get(current);
      if (node && node.type === NodeType.FOLDER) {
        stack.push(...node.childIds);
      }
    }
    return out;
  }

  // ---- Immutable snapshot builders ---------------------------------------

  // Build a deep, nested, frozen copy of a single item (without children for
  // files; with nested children for folders when `deep` is true).
  toItem(id, { deep = false } = {}) {
    const node = this.getNode(id);
    return this._clone(node, deep);
  }

  _clone(node, deep) {
    const base = {
      id: node.id,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
    };
    if (node.type === NodeType.FOLDER) {
      base.children = Object.freeze(
        deep
          ? node.childIds.map((cid) => this._clone(this.nodes.get(cid), true))
          : node.childIds.slice()
      );
    }
    return Object.freeze(base);
  }

  // Full hierarchy as a nested, frozen tree starting at root.
  toTree() {
    return this._clone(this.nodes.get(ROOT_ID), true);
  }

  // Compute the human-readable path (array of names) from root to the item.
  pathOf(id) {
    const names = [];
    let current = id;
    while (current != null) {
      const node = this.nodes.get(current);
      if (!node) break;
      names.unshift(node.name);
      current = node.parentId;
    }
    return names;
  }
}

export { ErrorCodes };
