// treeUiStore — a tiny external store for the tree's UI state (which folders
// are expanded, which item is selected, which items are checked).
//
// Why this exists (task section 4.3 — avoid unnecessary re-renders)
// -----------------------------------------------------------------
// Neither prop-drilling the selection Sets nor plain React Context lets us
// re-render ONLY the affected tree nodes:
//   * Prop-drilling the Sets -> new Set identity on every change -> every node
//     re-renders.
//   * React Context -> every useContext consumer re-renders on any change.
//
// Instead we keep this state OUTSIDE React in a small observable store and let
// each TreeNode subscribe — via useSyncExternalStore — to a *selector* that
// returns just that node's own booleans. React only re-renders a node when the
// selected slice actually changes value. So selecting one file re-renders just
// that file (and the previously selected one); expanding one folder re-renders
// just that folder (so its children can mount) — not the whole tree.

import { useSyncExternalStore } from 'react';

export function createTreeUiStore(initial = {}) {
  let state = {
    expanded: new Set(initial.expanded || ['root']),
    selectedId: initial.selectedId ?? 'root',
    checked: new Set(initial.checked || []),
  };

  const listeners = new Set();
  const emit = () => {
    for (const l of Array.from(listeners)) l();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getState = () => state;

  // --- mutations (replace Sets so identity changes, but only `emit` once) ---
  const toggleExpand = (id) => {
    const expanded = new Set(state.expanded);
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    state = { ...state, expanded };
    emit();
  };
  const expand = (id) => {
    if (state.expanded.has(id)) return;
    const expanded = new Set(state.expanded).add(id);
    state = { ...state, expanded };
    emit();
  };
  const select = (id) => {
    if (state.selectedId === id) return;
    state = { ...state, selectedId: id };
    emit();
  };
  const toggleCheck = (id) => {
    const checked = new Set(state.checked);
    checked.has(id) ? checked.delete(id) : checked.add(id);
    state = { ...state, checked };
    emit();
  };
  const setChecked = (ids) => {
    state = { ...state, checked: new Set(ids) };
    emit();
  };
  // Drop ids that no longer exist (called when the tree changes).
  const prune = (exists) => {
    let changed = false;
    const checked = new Set();
    for (const id of state.checked) {
      if (exists(id)) checked.add(id);
      else changed = true;
    }
    let selectedId = state.selectedId;
    if (selectedId && !exists(selectedId)) {
      selectedId = 'root';
      changed = true;
    }
    if (changed) {
      state = { ...state, checked, selectedId };
      emit();
    }
  };

  return {
    subscribe,
    getState,
    toggleExpand,
    expand,
    select,
    toggleCheck,
    setChecked,
    prune,
  };
}

// Per-node selective subscription. Returns { isExpanded, isSelected, isChecked }
// for a single id, and only causes a re-render when one of those flips.
export function useNodeUi(store, id) {
  const isExpanded = useSyncExternalStore(store.subscribe, () => store.getState().expanded.has(id));
  const isSelected = useSyncExternalStore(store.subscribe, () => store.getState().selectedId === id);
  const isChecked = useSyncExternalStore(store.subscribe, () => store.getState().checked.has(id));
  return { isExpanded, isSelected, isChecked };
}

// Whole-state subscription (for App-level needs like the selected id / count).
export function useTreeUiState(store) {
  return useSyncExternalStore(store.subscribe, store.getState);
}
