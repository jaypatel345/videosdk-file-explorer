// React integration tests — subscription cleanup, UI updates on SDK change,
// and error handling (task section 5, item 8).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import App from '../src/react/App.jsx';
import { useFileSystem } from '../src/react/useFileSystem.js';
import { FileSystemSDK, ROOT_ID } from '../src/sdk/index.js';

afterEach(cleanup);

describe('useFileSystem hook', () => {
  it('creates exactly one SDK instance and subscribes once, cleaning up on unmount', () => {
    const sdk = new FileSystemSDK();
    const subscribeSpy = vi.spyOn(sdk, 'subscribe');
    const { result, unmount } = renderHook(() => useFileSystem(() => sdk));
    // One subscription registered.
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(sdk.listenerCount).toBe(1);
    // SDK instance is stable.
    expect(result.current.sdk).toBe(sdk);
    unmount();
    // Subscription cleaned up.
    expect(sdk.listenerCount).toBe(0);
  });

  it('updates the derived tree when the SDK changes', () => {
    const sdk = new FileSystemSDK();
    const { result } = renderHook(() => useFileSystem(() => sdk));
    expect(result.current.tree.children.length).toBe(0);
    act(() => {
      result.current.actions.createFolder(ROOT_ID, 'New');
    });
    expect(result.current.tree.children.map((c) => c.name)).toContain('New');
  });

  it('captures SDK errors into lastError instead of throwing', () => {
    const sdk = new FileSystemSDK();
    const { result } = renderHook(() => useFileSystem(() => sdk));
    act(() => {
      result.current.actions.createFile(ROOT_ID, 'dup.txt');
    });
    act(() => {
      result.current.actions.createFile(ROOT_ID, 'DUP.TXT');
    });
    expect(result.current.lastError).toBeTruthy();
    expect(result.current.lastError.code).toBe('DUPLICATE_NAME');
  });
});

describe('<App /> integration', () => {
  it('renders the seeded tree root', () => {
    render(<App />);
    const treePanel = document.querySelector('.tree-panel');
    expect(within(treePanel).getByText('My Files')).toBeInTheDocument();
  });

  it('expands a folder to reveal its children', () => {
    render(<App />);
    // Documents is collapsed children initially (root expanded).
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.queryByText('Resume.pdf')).not.toBeInTheDocument();
    // Expand Documents.
    const docRow = screen.getByText('Documents').closest('.tree-row');
    fireEvent.click(within(docRow).getByLabelText('Expand'));
    expect(screen.getByText('Resume.pdf')).toBeInTheDocument();
  });

  it('shows details when an item is selected', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Notes.txt'));
    const details = document.querySelector('.details-panel');
    expect(within(details).getByText('Notes.txt')).toBeInTheDocument();
  });

  it('shows an error banner for an invalid operation', () => {
    const makeSdk = () => {
      const sdk = new FileSystemSDK();
      sdk.createFile(ROOT_ID, 'Notes.txt');
      sdk._history.clear();
      return sdk;
    };
    // Render App with a custom SDK via hook injection is not exposed, so we
    // drive the error through the public UI: create a duplicate using prompt.
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Notes.txt');
    render(<App />);
    // Root is selected by default; create a file named like an existing one.
    fireEvent.click(screen.getByText('+ File'));
    // Seeded app already has Notes.txt at root -> duplicate -> error banner.
    expect(document.querySelector('.error-banner')).toBeTruthy();
    promptSpy.mockRestore();
  });

  it('supports multi-select and shows the selected count', () => {
    render(<App />);
    const notesCheckbox = screen.getByLabelText('Select Notes.txt');
    fireEvent.click(notesCheckbox);
    expect(screen.getByText(/Delete selected \(1\)/)).toBeInTheDocument();
  });

  it('updates search results from the SDK', () => {
    render(<App />);
    const input = screen.getByLabelText('Search query');
    fireEvent.change(input, { target: { value: 'Notes' } });
    expect(screen.getByText(/result\(s\)/)).toBeInTheDocument();
    // The result row shows the path.
    expect(screen.getByText('My Files / Notes.txt')).toBeInTheDocument();
  });
});
