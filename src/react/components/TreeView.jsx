// TreeView + TreeNode — recursive rendering of the file hierarchy.
//
// Re-render behaviour (task section 4.3)
// --------------------------------------
// Each TreeNode logs when it renders so you can observe behaviour in the
// console. To avoid re-rendering the WHOLE tree on every interaction we:
//   * wrap TreeNode in React.memo so a node only re-renders when ITS props
//     change (its own node data, whether it is selected/expanded, etc.),
//   * pass stable callback references down (created with useCallback in App),
//   * pass selection/expansion as primitive booleans per node rather than
//     handing every node the whole Set (which would change identity each time).
//
// Result: expanding one folder or selecting one file re-renders only the
// affected nodes, not every node in the tree.

import React, { memo } from 'react';

function TreeNodeBase({
  node,
  depth,
  isExpanded,
  isSelected,
  isChecked,
  expandedIds,
  selectedId,
  checkedIds,
  onToggleExpand,
  onSelect,
  onToggleCheck,
}) {
  // Observe re-renders (required by the task). Open the browser console.
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
          onChange={() => onToggleCheck(node.id)}
          aria-label={`Select ${node.name}`}
        />
        {isFolder ? (
          <button
            className="twisty"
            onClick={() => onToggleExpand(node.id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="twisty-spacer" />
        )}
        <button className="node-label" onClick={() => onSelect(node.id)}>
          <span className="node-icon">{isFolder ? '📁' : '📄'}</span>
          {node.name}
        </button>
      </div>

      {isFolder && isExpanded && node.children.length > 0 && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isExpanded={expandedIds.has(child.id)}
              isSelected={selectedId === child.id}
              isChecked={checkedIds.has(child.id)}
              expandedIds={expandedIds}
              selectedId={selectedId}
              checkedIds={checkedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onToggleCheck={onToggleCheck}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// memo: skip re-render unless this node's own props change.
export const TreeNode = memo(TreeNodeBase);

export function TreeView({
  tree,
  expandedIds,
  selectedId,
  checkedIds,
  onToggleExpand,
  onSelect,
  onToggleCheck,
}) {
  return (
    <ul className="tree-root">
      <TreeNode
        node={tree}
        depth={0}
        isExpanded={expandedIds.has(tree.id)}
        isSelected={selectedId === tree.id}
        isChecked={checkedIds.has(tree.id)}
        expandedIds={expandedIds}
        selectedId={selectedId}
        checkedIds={checkedIds}
        onToggleExpand={onToggleExpand}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
      />
    </ul>
  );
}
