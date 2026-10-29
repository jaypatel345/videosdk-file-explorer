// Toolbar — create/rename/move/delete controls plus undo/redo and bulk delete.
// All actions operate on the SDK via callbacks passed from App. The component
// holds only transient UI state (prompt inputs are handled inline for brevity).

import React from 'react';

export function Toolbar({
  selectedItem,
  canUndo,
  canRedo,
  checkedCount,
  onNewFile,
  onNewFolder,
  onRename,
  onMove,
  onDelete,
  onUndo,
  onRedo,
  onBulkDelete,
}) {
  const hasSelection = Boolean(selectedItem);
  const isFolder = selectedItem?.type === 'folder';

  return (
    <div className="toolbar">
      <button onClick={onNewFolder} disabled={!isFolder} title="New folder in selected folder">
        + Folder
      </button>
      <button onClick={onNewFile} disabled={!isFolder} title="New file in selected folder">
        + File
      </button>
      <button onClick={onRename} disabled={!hasSelection || selectedItem.id === 'root'}>
        Rename
      </button>
      <button onClick={onMove} disabled={!hasSelection || selectedItem.id === 'root'}>
        Move
      </button>
      <button
        className="danger"
        onClick={onDelete}
        disabled={!hasSelection || selectedItem.id === 'root'}
      >
        Delete
      </button>
      <span className="divider" />
      <button onClick={onUndo} disabled={!canUndo}>
        ↶ Undo
      </button>
      <button onClick={onRedo} disabled={!canRedo}>
        ↻ Redo
      </button>
      <span className="divider" />
      <button className="danger" onClick={onBulkDelete} disabled={checkedCount === 0}>
        Delete selected ({checkedCount})
      </button>
    </div>
  );
}

// DetailsPanel — read-only info about the currently selected item.
export function DetailsPanel({ item, path }) {
  if (!item) {
    return (
      <div className="details-panel">
        <h3>Details</h3>
        <p className="muted">Select an item to see details.</p>
      </div>
    );
  }
  return (
    <div className="details-panel">
      <h3>Details</h3>
      <dl>
        <dt>Name</dt>
        <dd>{item.name}</dd>
        <dt>Type</dt>
        <dd>{item.type}</dd>
        <dt>ID</dt>
        <dd className="mono">{item.id}</dd>
        <dt>Location</dt>
        <dd>{path ? path.join(' / ') : '—'}</dd>
        {item.type === 'folder' && (
          <>
            <dt>Items</dt>
            <dd>{item.children ? item.children.length : 0}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// ActivityPanel — recent change events reported by the SDK.
export function ActivityPanel({ activity }) {
  return (
    <div className="activity-panel">
      <h3>Activity</h3>
      {activity.length === 0 ? (
        <p className="muted">No recent activity.</p>
      ) : (
        <ul className="activity-list">
          {activity.map((a) => (
            <li key={a.id}>
              <span className="activity-time">
                {a.at.toLocaleTimeString()}
              </span>{' '}
              {a.action}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ErrorBanner — shows the most recent SDK error (invalid operations).
export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner" role="alert">
      <strong>{error.code}:</strong> {error.message}
      <button className="dismiss" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}
