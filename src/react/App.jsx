// App — top-level composition. File-system state lives in the SDK (via
// useFileSystem). Tree UI state (expanded / selected / checked) lives in an
// external store (treeUiStore) so individual tree nodes can subscribe to only
// their own slice and avoid unnecessary re-renders (task section 4.3). Other
// UI state (search options) is plain React state.

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useState } from 'react';
import { useFileSystem } from './useFileSystem.js';
import { createTreeUiStore, useTreeUiState } from './treeUiStore.js';
import { TreeView } from './components/TreeView.jsx';
import { SearchBar, SearchResults } from './components/SearchBar.jsx';
import { Toolbar, DetailsPanel, ActivityPanel, ErrorBanner } from './components/Panels.jsx';
import './styles.css';

export default function App() {
  const { tree, history, actions, lastError, clearError, activity, version } =
    useFileSystem();

  // External store for tree UI state (created once; stable reference).
  const storeRef = useRef(null);
  if (storeRef.current === null) storeRef.current = createTreeUiStore({ expanded: ['root'], selectedId: 'root' });
  const store = storeRef.current;

  // App subscribes to the whole UI state for things it renders directly
  // (details panel, selected count). This re-renders <App/>, but NOT the tree
  // nodes — they are memoised on { node, store } and read their own slice.
  const ui = useTreeUiState(store);
  const { selectedId, checked } = ui;

  // Search UI state (plain React state).
  const [search, setSearch] = useState({
    query: '',
    type: 'all',
    sortBy: 'name',
    sortDir: 'asc',
    page: 1,
    pageSize: 10,
  });

  // When the file system changes, drop any selected/checked ids that no longer
  // exist so UI state stays consistent with the tree.
  useEffect(() => {
    store.prune(actions.exists);
  }, [version, store, actions]);

  // ---- Derived data -------------------------------------------------------
  const selectedItem = useMemo(
    () => (selectedId && actions.exists(selectedId) ? actions.getItem(selectedId, { deep: true }) : null),
    [selectedId, actions, version]
  );
  const selectedPath = useMemo(
    () => (selectedId && actions.exists(selectedId) ? actions.getPath(selectedId) : null),
    [selectedId, actions, version]
  );

  const searchResult = useMemo(() => {
    if (!search.query.trim()) return null;
    try {
      return actions.search(search);
    } catch (e) {
      return { total: 0, page: 1, pageSize: search.pageSize, totalPages: 0, results: [], error: e.message };
    }
  }, [actions, search, version]);

  // ---- Toolbar action handlers -------------------------------------------
  const handleNewFolder = useCallback(() => {
    const name = window.prompt('New folder name:');
    if (name) {
      actions.createFolder(selectedId, name);
      store.expand(selectedId);
    }
  }, [actions, selectedId, store]);

  const handleNewFile = useCallback(() => {
    const name = window.prompt('New file name:');
    if (name) {
      actions.createFile(selectedId, name);
      store.expand(selectedId);
    }
  }, [actions, selectedId, store]);

  const handleRename = useCallback(() => {
    if (!selectedItem) return;
    const name = window.prompt('Rename to:', selectedItem.name);
    if (name) actions.rename(selectedItem.id, name);
  }, [actions, selectedItem]);

  const handleMove = useCallback(() => {
    if (!selectedItem) return;
    const targetId = window.prompt('Move to folder id (e.g. "root"):', 'root');
    if (targetId) actions.move(selectedItem.id, targetId.trim());
  }, [actions, selectedItem]);

  const handleDelete = useCallback(() => {
    if (!selectedItem) return;
    if (window.confirm(`Delete "${selectedItem.name}"?`)) actions.delete(selectedItem.id);
  }, [actions, selectedItem]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected item(s)?`)) return;
    const ok = actions.deleteMany(ids);
    // Clear selection only on success; on failure keep it and show the error.
    if (ok) store.setChecked([]);
  }, [actions, checked, store]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>VideoSDK File Explorer</h1>
        <p className="muted">
          A framework-agnostic file-system SDK with a React UI. Open the console
          to observe tree re-renders.
        </p>
      </header>

      <ErrorBanner error={lastError} onDismiss={clearError} />

      <Toolbar
        selectedItem={selectedItem}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        checkedCount={checked.size}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={handleRename}
        onMove={handleMove}
        onDelete={handleDelete}
        onUndo={actions.undo}
        onRedo={actions.redo}
        onBulkDelete={handleBulkDelete}
      />

      <div className="layout">
        <section className="panel tree-panel">
          <h3>Files</h3>
          <TreeView tree={tree} store={store} />
        </section>

        <section className="panel search-panel">
          <h3>Search</h3>
          <SearchBar
            query={search.query}
            type={search.type}
            sortBy={search.sortBy}
            sortDir={search.sortDir}
            onChange={(patch) => setSearch((s) => ({ ...s, ...patch }))}
          />
          <SearchResults
            result={searchResult}
            onSelect={(id) => store.select(id)}
            onPage={(page) => setSearch((s) => ({ ...s, page }))}
          />
        </section>

        <aside className="panel side-panel">
          <DetailsPanel item={selectedItem} path={selectedPath} />
          <ActivityPanel activity={activity} />
        </aside>
      </div>
    </div>
  );
}
