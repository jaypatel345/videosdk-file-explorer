// operations.js — low-level mutations on a TreeStore.
//
// Each operation here is "primitive": it validates, mutates the flat node map,
// and returns a result object that includes an `inverse` function. The inverse
// function, when called, reverts exactly that mutation. Composing inverses is
// what gives us undo/redo (History) and transaction rollback for free.
//
// IMPORTANT: these functions assume validation-friendly inputs but still
// enforce every rule from the task. They throw FileSystemError on any invalid
// operation BEFORE mutating, so a failed op never corrupts the store.

import { NodeType } from './TreeStore.js';
import { err } from './errors.js';

// --- create -------------------------------------------------------------
// Insert a brand-new node (file or folder) into a parent folder.
export function opCreate(store, { id, name, type, parentId, index = null }) {
  store.assertValidName(name);
  const parent = store.getFolder(parentId); // throws if missing / not folder
  store.assertNameAvailable(parentId, name);

  const node = {
    id,
    name: name.trim(),
    type,
    parentId,
    ...(type === NodeType.FOLDER ? { childIds: [] } : {}),
  };
  store.nodes.set(id, node);
  if (index == null || index >= parent.childIds.length) {
    parent.childIds.push(id);
  } else {
    parent.childIds.splice(index, 0, id);
  }

  return {
    type: 'create',
    id,
    inverse: () => opDeleteSubtree(store, { id }),
  };
}

// --- rename -------------------------------------------------------------
export function opRename(store, { id, name }) {
  if (id === 'root') throw err.invalidArg('The root folder cannot be renamed.');
  store.assertValidName(name);
  const node = store.getNode(id);
  const previousName = node.name;
  if (previousName === name.trim()) {
    // No-op rename: still return a valid, chainable op-result so undo/redo
    // toggling never hits an undefined inverse.
    const noop = { type: 'rename', id, inverse: () => noop };
    return noop;
  }
  store.assertNameAvailable(node.parentId, name, id);
  node.name = name.trim();

  return {
    type: 'rename',
    id,
    inverse: () => opRename(store, { id, name: previousName }),
  };
}

// --- move ---------------------------------------------------------------
export function opMove(store, { id, targetParentId, index = null }) {
  if (id === 'root') throw err.invalidMove('The root folder cannot be moved.');
  const node = store.getNode(id);
  const target = store.getFolder(targetParentId); // throws if not a folder

  // Rule: a folder cannot be moved into itself or any of its descendants.
  if (node.type === NodeType.FOLDER && store.isDescendantOrSelf(targetParentId, id)) {
    throw err.invalidMove(
      `Cannot move "${node.name}" into itself or one of its descendants.`
    );
  }

  const oldParentId = node.parentId;
  const oldParent = store.getNode(oldParentId);
  const oldIndex = oldParent.childIds.indexOf(id);

  // Name must be unique in the destination folder.
  if (targetParentId !== oldParentId) {
    store.assertNameAvailable(targetParentId, node.name);
  }

  // Detach from old parent.
  oldParent.childIds.splice(oldIndex, 1);
  // Attach to new parent.
  if (index == null || index >= target.childIds.length) {
    target.childIds.push(id);
  } else {
    target.childIds.splice(index, 0, id);
  }
  node.parentId = targetParentId;

  return {
    type: 'move',
    id,
    inverse: () =>
      opMove(store, { id, targetParentId: oldParentId, index: oldIndex }),
  };
}

// --- delete (whole subtree) --------------------------------------------
// Removes a node and all its descendants. The inverse reconstructs the exact
// subtree (same ids, names, structure, and position) so undoing a folder
// deletion restores its complete nested contents.
export function opDeleteSubtree(store, { id }) {
  if (id === 'root') throw err.invalidArg('The root folder cannot be deleted.');
  const node = store.getNode(id);
  const parentId = node.parentId;
  const parent = store.getNode(parentId);
  const indexInParent = parent.childIds.indexOf(id);

  // Snapshot every node in the subtree so we can rebuild it on undo.
  const subtreeIds = store.collectSubtreeIds(id);
  const snapshots = subtreeIds.map((sid) => {
    const n = store.nodes.get(sid);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      parentId: n.parentId,
      childIds: n.type === NodeType.FOLDER ? n.childIds.slice() : undefined,
    };
  });

  // `applyDelete` removes the subtree; `applyRestore` puts it back. Each
  // returns the OTHER as its inverse WITHOUT executing it, so undo/redo can
  // toggle indefinitely.
  const makeDeleteResult = () => ({ type: 'delete', id, inverse: applyRestore });
  const makeRestoreResult = () => ({ type: 'restore', id, inverse: applyDelete });

  function applyDelete() {
    const ids = store.collectSubtreeIds(id);
    for (const sid of ids) store.nodes.delete(sid);
    const p = store.getNode(parentId);
    const idx = p.childIds.indexOf(id);
    if (idx !== -1) p.childIds.splice(idx, 1);
    return makeDeleteResult();
  }

  function applyRestore() {
    // Recreate all nodes first (so childIds references resolve), then relink
    // the subtree root into its original parent position.
    for (const snap of snapshots) {
      store.nodes.set(snap.id, {
        id: snap.id,
        name: snap.name,
        type: snap.type,
        parentId: snap.parentId,
        ...(snap.type === NodeType.FOLDER
          ? { childIds: snap.childIds.slice() }
          : {}),
      });
    }
    const p = store.getNode(parentId);
    p.childIds.splice(indexInParent, 0, id);
    return makeRestoreResult();
  }

  // Perform the initial delete now and return its command.
  for (const sid of subtreeIds) store.nodes.delete(sid);
  parent.childIds.splice(indexInParent, 1);
  return makeDeleteResult();
}
