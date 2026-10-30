// Re-render behaviour test (task section 4.3).
// We spy on console.log (the TreeNode render probe) and assert that selecting
// or expanding one node does NOT re-render every node in the tree.
//
// Note: StrictMode double-invokes renders, so we assert on the SET of node
// names that re-rendered, not exact counts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import App from '../src/react/App.jsx';

afterEach(cleanup);

// Collect the node names printed by `[render] TreeNode <name>` during `fn`.
function captureRenders(fn) {
  const names = new Set();
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    if (args[0] === '[render] TreeNode') names.add(args[1]);
  });
  fn();
  spy.mockRestore();
  return names;
}

describe('TreeNode re-render isolation (§4.3)', () => {
  it('selecting a file re-renders only the new and previously selected nodes', () => {
    render(<App />);
    // Root ("My Files") is selected by default. Expand Documents so there are
    // sibling subtrees that could wrongly re-render.
    const docRow = screen.getByText('Documents').closest('.tree-row');
    fireEvent.click(within(docRow).getByLabelText('Expand'));

    // Select Notes.txt and capture which nodes re-rendered.
    const rendered = captureRenders(() => {
      fireEvent.click(screen.getByText('Notes.txt'));
    });

    // The newly selected node re-renders.
    expect(rendered.has('Notes.txt')).toBe(true);
    // The previously selected node (root = "My Files") re-renders to lose its
    // highlight. That is correct and expected.
    expect(rendered.has('My Files')).toBe(true);
    // Everything ELSE must NOT re-render.
    expect(rendered.has('Resume.pdf')).toBe(false);
    expect(rendered.has('Project Plan.docx')).toBe(false);
    expect(rendered.has('Images')).toBe(false);
    expect(rendered.has('Documents')).toBe(false);
    // Exactly two nodes re-rendered.
    expect(rendered.size).toBe(2);
  });

  it('switching selection between siblings re-renders only those two siblings', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Documents')); // now Documents is selected
    const rendered = captureRenders(() => {
      fireEvent.click(screen.getByText('Images'));
    });
    expect(rendered.has('Documents')).toBe(true);
    expect(rendered.has('Images')).toBe(true);
    expect(rendered.has('My Files')).toBe(false);
    expect(rendered.has('Notes.txt')).toBe(false);
    expect(rendered.size).toBe(2);
  });

  it('expanding a folder re-renders that folder but not its siblings', () => {
    render(<App />);
    const rendered = captureRenders(() => {
      const docRow = screen.getByText('Documents').closest('.tree-row');
      fireEvent.click(within(docRow).getByLabelText('Expand'));
    });

    // Documents re-renders (its isExpanded flipped) and its children mount.
    expect(rendered.has('Documents')).toBe(true);
    expect(rendered.has('Resume.pdf')).toBe(true);
    // Siblings must NOT re-render.
    expect(rendered.has('Images')).toBe(false);
    expect(rendered.has('Notes.txt')).toBe(false);
    expect(rendered.has('My Files')).toBe(false);
  });

  it('collapsing a folder re-renders only that folder', () => {
    render(<App />);
    const docRow = screen.getByText('Documents').closest('.tree-row');
    // First expand it
    fireEvent.click(within(docRow).getByLabelText('Expand'));

    // Now collapse it and capture re-renders
    const rendered = captureRenders(() => {
      fireEvent.click(within(docRow).getByLabelText('Collapse'));
    });

    // Only Documents re-renders (to unmount children). Children unmount (don't re-render).
    expect(rendered.has('Documents')).toBe(true);
    expect(rendered.has('Images')).toBe(false);
    expect(rendered.has('Notes.txt')).toBe(false);
    expect(rendered.has('My Files')).toBe(false);
    expect(rendered.size).toBe(1);
  });

  it('checking a node does NOT re-render unrelated nodes', () => {
    render(<App />);
    const rendered = captureRenders(() => {
      fireEvent.click(screen.getByLabelText('Select Notes.txt'));
    });
    expect(rendered.has('Notes.txt')).toBe(true);
    expect(rendered.has('Documents')).toBe(false);
    expect(rendered.has('Images')).toBe(false);
    expect(rendered.has('My Files')).toBe(false);
  });
});
