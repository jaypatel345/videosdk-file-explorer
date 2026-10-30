// TreeView + TreeNode — recursive rendering of the file hierarchy.
//
// Re-render behaviour (task section 4.3)
// --------------------------------------
// Each TreeNode subscribes (via useNodeUi -> useSyncExternalStore) to ONLY its
// own slice of UI state (isExpanded / isSelected / isChecked) from an external
// store. React re-renders a node only when one of THOSE booleans actually
// changes value. Combined with React.memo on the node (so a parent re-render
// doesn't force children to re-render unless their `node` snapshot changed),
// this means:
//
//   * Selecting Notes.txt   -> only Notes.txt and the previously selected node
//     re-render.
//   * Expanding Documents   -> Documents re-renders (its isExpanded flipped)
//     and its children mount; siblings like Images / Notes.txt do NOT re-render.
//
// Open the browser console and watch the `[render] TreeNode <name>` logs.

import React, { memo } from 'react';
import { useNodeUi } from '../treeUiStore.js';

function TreeNodeBase({ node, depth, store }) {
  // Subscribe to just this node's own UI flags.
  const { isExpanded, isSelected, isChecked } = useNodeUi(store, node.id);

  // Observe re-renders (required by the task).
  console.log('[render] TreeNode', node.name);

  const isFolder = node.type === 'folder';

  return (
    <li className="tree-node">
      <div
        className={`tree-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => store.toggleCheck(node.id)}
          aria-label={`Select ${node.name}`}
        />
        {isFolder ? (
          <button
            className="twisty"
            onClick={() => store.toggleExpand(node.id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="twisty-spacer" />
        )}
        <button className="node-label" onClick={() => store.select(node.id)}>
          <span className="node-icon">{isFolder ? '📁' : '📄'}</span>
          {node.name}
        </button>
      </div>

      {isFolder && isExpanded && node.children.length > 0 && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} store={store} />
          ))}
        </ul>
      )}
    </li>
  );
}

// memo: a node re-renders only when its own `node` snapshot (or depth) changes.
// `store` is a stable reference for the app's lifetime. UI-flag changes are
// delivered through the store subscription inside useNodeUi, not through props.
function areEqual(prev, next) {
  return prev.node === next.node && prev.depth === next.depth && prev.store === next.store;
}

export const TreeNode = memo(TreeNodeBase, areEqual);

export function TreeView({ tree, store }) {
  return (
    <ul className="tree-root">
      <TreeNode node={tree} depth={0} store={store} />
    </ul>
  );
}
