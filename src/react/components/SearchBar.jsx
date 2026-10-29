// SearchBar — controls for querying the SDK. The component owns only UI state
// (the text input, filter, sort). The actual search is performed by the SDK;
// results are displayed by SearchResults.

import React from 'react';

export function SearchBar({ query, type, sortBy, sortDir, onChange }) {
  return (
    <div className="search-bar">
      <input
        className="search-input"
        type="text"
        placeholder="Search files and folders…"
        value={query}
        onChange={(e) => onChange({ query: e.target.value, page: 1 })}
        aria-label="Search query"
      />
      <select
        value={type}
        onChange={(e) => onChange({ type: e.target.value, page: 1 })}
        aria-label="Filter by type"
      >
        <option value="all">All</option>
        <option value="folder">Folders</option>
        <option value="file">Files</option>
      </select>
      <select
        value={sortBy}
        onChange={(e) => onChange({ sortBy: e.target.value })}
        aria-label="Sort by"
      >
        <option value="name">Name</option>
        <option value="type">Type</option>
        <option value="path">Path</option>
      </select>
      <button
        className="sort-dir"
        onClick={() => onChange({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
        aria-label="Toggle sort direction"
      >
        {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>
    </div>
  );
}

export function SearchResults({ result, onSelect, onPage }) {
  if (!result) return null;
  if (result.total === 0) {
    return <p className="muted">No matches.</p>;
  }
  return (
    <div className="search-results">
      <p className="muted">
        {result.total} result(s) — page {result.page} / {result.totalPages}
      </p>
      <ul>
        {result.results.map((r) => (
          <li key={r.id}>
            <button className="result-row" onClick={() => onSelect(r.id)}>
              <span className="node-icon">{r.type === 'folder' ? '📁' : '📄'}</span>
              <span className="result-name">{r.name}</span>
              <span className="muted result-path">{r.pathString}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="pager">
        <button disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}>
          Prev
        </button>
        <button
          disabled={result.page >= result.totalPages}
          onClick={() => onPage(result.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
