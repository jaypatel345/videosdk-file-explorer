// App — top-level composition. Owns UI-only state (expanded folders, selected
// item, multi-select checkboxes, search options) and wires stable callbacks
// down to child components. File-system state lives entirely in the SDK via
// the useFileSystem hook.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFileSystem } from './useFileSystem.js';
import { TreeView } from './components/TreeView.jsx';
import { SearchBar, SearchResults } from './components/SearchBar.jsx';
import { Toolbar, DetailsPanel, ActivityPanel, ErrorBanner } from './components/Panels.jsx';
import './styles.css';

export default function App() {
  const { tree, history, actions, lastError, clearError, activity, version } =
    useFileSystem();

  // ---- UI-only state ------------------------------------------------------
  const [expandedIds, setExpandedIds] = useState(() => new Set(['root']));
  const [selectedId, setSelectedId] = useState('root');
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [search, setSearch] = useState({
    query: '',
    type: 'all',
    sortBy: 'name',
    sortDir: 'asc',
    page: 1,
    pageSize: 10,
  });

  // ---- Keep UI state consistent when the tree changes --------------------
  // If the selected or checked items no longer exist (e.g. deleted), drop them.
  useEffect(() => {
    if (selectedId && !actions.exists(selectedId)) setSelectedId('root');
    setCheckedIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (actions.exists(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [version, actions, selectedId]);

  // ---- Stable callbacks (so memoised TreeNodes don't re-render needlessly)-
  const onToggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const onSelect = useCallback((id) => setSelectedId(id), []);

  const onToggleCheck = useCallback((id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ---- Derived data -------------------------------------------------------
  const selectedItem = useMemo(
    () => (selectedId && actions.exists(selectedId) ? actions.getItem(selectedId, { deep: true }) : null),
    [selectedId, actions, version]
  );
  const selectedPath = useMemo(
    () => (selectedId && actions.exists(selectedId) ? actions.getPath(selectedId) : null),
    [selectedId, actions, version]
  );

  // Search results are computed from the SDK and refreshed when the tree
  // changes (version) or the search options change.
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
      setExpandedIds((prev) => new Set(prev).add(selectedId));
    }
  }, [actions, selectedId]);

  const handleNewFile = useCallback(() => {
    const name = window.prompt('New file name:');
    if (name) {
      actions.createFile(selectedId, name);
      setExpandedIds((prev) => new Set(prev).add(selectedId));
    }
  }, [actions, selectedId]);

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
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected item(s)?`)) return;
    const ok = actions.deleteMany(ids);
    // Clear selection only on success; on failure keep it and show the error.
    if (ok) setCheckedIds(new Set());
  }, [actions, checkedIds]);

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
        checkedCount={checkedIds.size}
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
          <TreeView
            tree={tree}
            expandedIds={expandedIds}
            selectedId={selectedId}
            checkedIds={checkedIds}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onToggleCheck={onToggleCheck}
          />
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
            onSelect={(id) => setSelectedId(id)}
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
