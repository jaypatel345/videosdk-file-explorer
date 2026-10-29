# VideoSDK File Explorer

A reusable, **framework-agnostic JavaScript File Explorer SDK** plus a **React (Vite)**
application that uses it. The SDK manages a hierarchical, in-memory file/folder
system (create, rename, move, delete, search, undo/redo, change subscriptions,
and atomic transactions). React is only a thin UI layer — the SDK is the single
source of truth and has **no dependency on React**.

---

## 1. How to run

```bash
npm install        # install dependencies

npm run dev        # run the React app  -> http://localhost:5173
npm test           # run the automated test suite (Vitest)
npm run build      # production build
```

Requirements: Node 18+ (developed on Node 26, npm 11).

> To observe re-render behaviour, run `npm run dev`, open the browser console,
> and watch the `[render] TreeNode <name>` logs while expanding folders,
> selecting items, creating/renaming, and searching.

---

## 2. Project structure

```
src/
├── main.jsx                 # React entry; mounts <App/>
├── sdk/                     # === framework-agnostic SDK ===
│   ├── index.js             # public barrel + createSeededSDK()
│   ├── FileSystemSDK.js      # public facade (the API consumers use)
│   ├── TreeStore.js          # in-memory source of truth + immutable snapshots
│   ├── operations.js         # primitive mutations w/ inverse commands
│   ├── search.js             # read-only search (filter/sort/paginate)
│   ├── History.js            # undo/redo stacks
│   ├── EventEmitter.js       # hand-written pub/sub
│   ├── ids.js                # unique id generation + name compare
│   └── errors.js             # FileSystemError + error codes
└── react/                   # === React UI ===
    ├── App.jsx               # composition + UI state + callbacks
    ├── useFileSystem.js      # custom hook bridging SDK <-> React
    └── components/
        ├── TreeView.jsx       # recursive, memoised tree (console.log here)
        ├── SearchBar.jsx      # search controls + results
        └── Panels.jsx         # Toolbar, Details, Activity, ErrorBanner
tests/
├── sdk.test.js              # SDK unit tests (success + failure)
└── react.test.jsx           # React integration tests
```

---

## 3. Data model & architecture

The SDK stores every node in a **flat `Map<id, node>`** (an adjacency map), not
a deeply nested object. Each node records its own `parentId`; folders keep an
ordered list of `childIds`. A single synthetic root (`id: 'root'`, name
`"My Files"`) always exists.

```js
// folder node
{ id: 'node_1', name: 'Documents', type: 'folder', parentId: 'root', childIds: ['node_2'] }
// file node
{ id: 'node_2', name: 'Resume.pdf', type: 'file',  parentId: 'node_1' }
```

**Why a flat map:** O(1) lookup by id, cheap moves (retarget `parentId` + two
array edits), simple "is descendant" checks (walk `parentId` upward), and
straightforward subtree collection for delete/restore.

**Immutability:** the internal `Map` is never exposed. Reads (`getTree`,
`getItem`) return **fresh, deeply-cloned, `Object.freeze`d** structures (objects
*and* arrays frozen), so consumers cannot mutate internal state.

**Atomic commits:** every public mutation runs through a private `#commit`
helper that executes one or more primitive operations and only records history +
notifies subscribers on success. If any primitive throws, applied primitives are
rolled back via their inverses, so the store is never left partially changed.

```
        FileSystemSDK  (public facade)
          │     │        │          │
     TreeStore History  search   EventEmitter
          │
     operations (primitive mutations, each returns an `inverse`)

React:  useFileSystem() --subscribes--> SDK --notifies--> version bump --> re-render
```

---

## 4. SDK public API

```js
import { FileSystemSDK, createSeededSDK, ROOT_ID } from './src/sdk/index.js';

const sdk = new FileSystemSDK();   // empty, root = "My Files"
// or
const sdk = createSeededSDK();     // pre-filled example tree
```

### Reads (return frozen snapshots)

| Method | Returns | Notes |
|--------|---------|-------|
| `getTree()` | nested frozen tree from root | full hierarchy |
| `getItem(id, { deep })` | frozen item snapshot | `deep:true` includes children |
| `exists(id)` | `boolean` | |
| `getPath(id)` | `string[]` | names from root → item |

### Mutations (throw `FileSystemError` on invalid input)

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `createFile(parentId, name)` | folder id, name | created item | add a file |
| `createFolder(parentId, name)` | folder id, name | created item | add a folder |
| `rename(id, newName)` | id, name | updated item | keeps the same id |
| `move(id, targetParentId)` | id, folder id | moved item | keeps the same id |
| `delete(id)` | id | `true` | removes item + all descendants |

### Search (read-only)

```js
sdk.search({
  query: 're',     // case-insensitive substring; empty => no results
  type: 'all',     // 'all' | 'file' | 'folder'
  sortBy: 'name',  // 'name' | 'type' | 'path'
  sortDir: 'asc',  // 'asc' | 'desc'
  page: 1,         // 1-based
  pageSize: 20,
});
// => { total, page, pageSize, totalPages,
//      results: [{ id, name, type, parentId, path, pathString }] }
```

Invalid options (bad `type`, `page < 1`, etc.) throw a meaningful error.

### Undo / redo

| Method | Returns |
|--------|---------|
| `undo()` / `redo()` | `boolean` |
| `canUndo()` / `canRedo()` | `boolean` |
| `historyState()` | `{ canUndo, canRedo, nextUndoLabel, nextRedoLabel }` |

### Change subscriptions

```js
const unsubscribe = sdk.subscribe((event) => {
  // event = { type: 'change', action: 'Create file "a.txt"' }
});
unsubscribe(); // removes the listener
```

### Bonus: transactions & bulk delete

```js
sdk.transaction((tx) => {
  const folder = tx.createFolder(ROOT_ID, 'Project');
  tx.createFile(folder.id, 'readme.md');
});                      // all-or-nothing; one undo entry; one change event

sdk.deleteMany([id1, id2]); // atomic bulk delete (single transaction)
```

### End-to-end example (plain JS, no React)

```js
import { FileSystemSDK, ROOT_ID } from './src/sdk/index.js';

const sdk = new FileSystemSDK();
const docs = sdk.createFolder(ROOT_ID, 'Documents');
sdk.createFile(docs.id, 'Resume.pdf');
sdk.subscribe((e) => console.log('event:', e.action));

sdk.rename(docs.id, 'Docs');  // event: Rename to "Docs"
sdk.undo();                   // back to "Documents"
console.log(sdk.search({ query: 'resume' }).results[0].pathString);
// => "My Files / Documents / Resume.pdf"
```

---

## 5. Validation rules

Enforced **before** any mutation, so a rejected operation never corrupts state:

1. Stable, unique ids; rename/move preserve identity.
2. Names unique within a folder, **case-insensitive**.
3. Files cannot contain other items.
4. A folder cannot be moved into itself or any descendant.
5. Deleting a folder removes all descendants.
6. Invalid operations throw `FileSystemError` (with a `code`); state is untouched.
7. Returned snapshots are frozen — consumers cannot mutate internal state.

---

## 6. Undo / redo — how it works

**Inverse commands.** Each primitive (`opCreate`, `opRename`, `opMove`,
`opDeleteSubtree`) validates, mutates, and returns `{ type, id, inverse }` where
`inverse()` reverts the change and returns a fresh command whose `inverse()`
re-applies it. Calling `inverse()` therefore *toggles* a change back and forth.

**Delete/restore.** Deletion snapshots the entire subtree up front and builds a
pair of mutually-referencing functions (`applyDelete` / `applyRestore`). So
undoing a folder deletion **restores its complete nested structure** (same ids,
names, positions); redoing deletes it again.

**History stacks** (`History.js`): two stacks, `undoStack` and `redoStack`.
- `push(entry)` runs after each successful op/transaction and **clears the redo
  stack** — performing a new operation after an undo discards the undone future.
- `undo()` pops `undoStack`, reverts, pushes to `redoStack`; `redo()` is the mirror.

**Guaranteed behaviours:**
- Undo/redo works for create, rename, move, delete.
- Folder-deletion undo restores the whole nested tree.
- **Failed operations create no history entry** (history is pushed only after a
  successful commit).
- A new operation after undo clears the redo stack.
- Atomic commit + paired inverses keep the store consistent at all times.

A transaction is a single history entry wrapping many primitives, so it undoes
and redoes as one unit.

---

## 7. React integration & re-render behaviour

- **`useFileSystem` hook**: creates the SDK once (via `useRef`), subscribes once
  on mount and returns the unsubscribe for cleanup (no duplicate subscriptions),
  bumps a `version` counter on each change to trigger re-renders, derives
  `tree`/`history` via `useMemo`, and captures thrown `FileSystemError`s into a
  `lastError` state instead of crashing render.
- **State placement**: file-system data lives only in the SDK; React holds only
  UI state (expanded folders, selected item, checkbox selection, search input).
  Stale selection/expansion is pruned when the tree changes.
- **Re-render optimisation** (observe via the `[render] TreeNode` logs):
  - `TreeNode` is wrapped in `React.memo` → a node re-renders only when *its*
    props change.
  - Each node receives per-node booleans (`isSelected`, `isExpanded`,
    `isChecked`) rather than the whole selection Set, so `memo` stays effective.
  - Callbacks are stabilised with `useCallback`, preserving identity.
  - Expand/collapse is pure UI state and never touches the SDK.
  > In `React.StrictMode` (dev/tests) renders are intentionally doubled; production
  > renders once.

---

## 8. Bonus features implemented

- **Atomic transactions** (`sdk.transaction`): all-or-nothing; rolls back on
  failure; notifies subscribers once; counts as one undoable entry; a failed
  transaction creates no history entry.
- **Bulk delete** (`sdk.deleteMany`): deletes multiple items as a single
  transaction (one undo restores all); dedupes ids already covered by an
  ancestor in the list.
- **Multi-selection in the UI**: per-node checkboxes, live selected count,
  "Delete selected (N)" button, selection cleared only on success (kept with an
  error shown on failure).

---

## 9. Testing

`npm test` runs **42 tests** across two files, covering success *and* failure:

- **`tests/sdk.test.js`**: CRUD; case-insensitive duplicate rejection; create
  inside a file rejected; move-into-self/descendant rejected; empty-name and
  unknown-id rejection without corruption; no undo entry on failure; snapshot
  immutability; search (nested, type filter, empty query, invalid options,
  sorting, pagination, reflects mutations, path info); undo/redo of
  create/rename/move; nested folder restore on delete-undo; redo cleared after a
  new op; subscribe/unsubscribe + multiple subscribers; transactions
  (commit-once, full rollback + no event/history on failure, single undo entry);
  `deleteMany` atomic + descendant dedup.
- **`tests/react.test.jsx`**: hook creates exactly one SDK + one subscription and
  cleans up on unmount; tree updates on change; errors captured to `lastError`;
  app renders the seeded tree, expands a folder, shows details on select, shows
  the error banner on an invalid op, shows the multi-select count, and updates
  search results.

---

## 10. Known limitations

- **In-memory only** — no persistence; a refresh resets to the seeded tree.
- **Ids are session-scoped** (not globally unique across reloads).
- **Move in the UI uses a prompt for the target folder id** — functional but not
  polished; drag-and-drop would be a nicer UX (the SDK `move` supports it).
- **Activity log** lives in React, capped at 50 entries, not persisted.
- **Search is substring** (not fuzzy/regex) and re-scans nodes per call — fine
  for in-memory sizes here.
- **All operations are synchronous** (in-memory), so UI "pending state" handling
  is minimal by design.
- **Bulk operations in the UI cover delete only** (as specified); bulk
  move/rename could reuse the same transaction mechanism.
