// useFileSystem — the single bridge between the framework-agnostic SDK and
// React. It:
//   * holds a stable reference to the SDK instance (created once),
//   * subscribes to SDK change events and triggers a re-render when they fire,
//   * exposes a snapshot of the current tree + history flags,
//   * exposes stable, memoised action callbacks that call the SDK and surface
//     errors (instead of throwing into render).
//
// The SDK remains the source of truth. React state here is only a "version"
// counter used to request re-renders when the SDK notifies us of a change.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSeededSDK } from '../sdk/index.js';

export function useFileSystem(makeSdk = createSeededSDK) {
  // Create the SDK exactly once (lazy initial state). This is the source of
  // truth; it is NOT React state.
  const sdkRef = useRef(null);
  if (sdkRef.current === null) sdkRef.current = makeSdk();
  const sdk = sdkRef.current;

  // A monotonically increasing counter bumped on every SDK change event. We
  // read the tree fresh from the SDK whenever this changes.
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState(null);
  // Activity log of recent changes (most recent first).
  const [activity, setActivity] = useState([]);

  // Subscribe ONCE on mount; clean up on unmount. The empty dependency array
  // plus the ref guarantees we never create duplicate subscriptions.
  useEffect(() => {
    const unsubscribe = sdk.subscribe((event) => {
      setVersion((v) => v + 1);
      setActivity((log) =>
        [{ id: Date.now() + Math.random(), action: event.action, at: new Date() }, ...log].slice(0, 50)
      );
    });
    return unsubscribe; // cleanup removes the subscription
  }, [sdk]);

  // Derive snapshots from the SDK. Recomputed whenever `version` changes.
  const tree = useMemo(() => sdk.getTree(), [sdk, version]);
  const history = useMemo(() => sdk.historyState(), [sdk, version]);

  // Wrap a mutating SDK call so thrown FileSystemErrors become `lastError`
  // instead of crashing the component. Returns true on success.
  const runSafe = useCallback((fn) => {
    try {
      fn();
      setLastError(null);
      return true;
    } catch (e) {
      setLastError({ code: e.code || 'ERROR', message: e.message });
      return false;
    }
  }, []);

  // Stable action callbacks. These are the API the UI components use.
  const actions = useMemo(
    () => ({
      createFile: (parentId, name) => runSafe(() => sdk.createFile(parentId, name)),
      createFolder: (parentId, name) => runSafe(() => sdk.createFolder(parentId, name)),
      rename: (id, name) => runSafe(() => sdk.rename(id, name)),
      move: (id, targetParentId) => runSafe(() => sdk.move(id, targetParentId)),
      delete: (id) => runSafe(() => sdk.delete(id)),
      deleteMany: (ids) => runSafe(() => sdk.deleteMany(ids)),
      undo: () => runSafe(() => sdk.undo()),
      redo: () => runSafe(() => sdk.redo()),
      search: (options) => sdk.search(options),
      getItem: (id, opts) => sdk.getItem(id, opts),
      getPath: (id) => sdk.getPath(id),
      exists: (id) => sdk.exists(id),
    }),
    [sdk, runSafe]
  );

  const clearError = useCallback(() => setLastError(null), []);

  return { sdk, tree, history, actions, lastError, clearError, activity, version };
}
