// search.js — case-insensitive search across the whole hierarchy.
//
// Pure, read-only function: it walks the store's flat node map and returns
// frozen result objects (name, type, id, and a human-readable path). It never
// mutates the store, and because it reads live nodes each call, results always
// reflect the current file system state.
//
// Options:
//   query      : string, matched as a case-insensitive substring of the name.
//                Empty / whitespace-only queries return an empty result set.
//   type       : 'file' | 'folder' | 'all' (default 'all') — filter by type.
//   sortBy     : 'name' | 'type' | 'path' (default 'name').
//   sortDir    : 'asc' | 'desc' (default 'asc').
//   page       : 1-based page number (default 1).
//   pageSize   : items per page (default 20). Must be a positive integer.

import { ROOT_ID, NodeType } from './TreeStore.js';
import { err } from './errors.js';

const VALID_TYPES = new Set(['file', 'folder', 'all']);
const VALID_SORT = new Set(['name', 'type', 'path']);
const VALID_DIR = new Set(['asc', 'desc']);

export function searchItems(store, options = {}) {
  const {
    query = '',
    type = 'all',
    sortBy = 'name',
    sortDir = 'asc',
    page = 1,
    pageSize = 20,
  } = options;

  // Validate options up-front with meaningful errors.
  if (typeof query !== 'string') throw err.invalidArg('query must be a string.');
  if (!VALID_TYPES.has(type)) throw err.invalidArg(`Invalid type filter "${type}".`);
  if (!VALID_SORT.has(sortBy)) throw err.invalidArg(`Invalid sortBy "${sortBy}".`);
  if (!VALID_DIR.has(sortDir)) throw err.invalidArg(`Invalid sortDir "${sortDir}".`);
  if (!Number.isInteger(page) || page < 1) throw err.invalidArg('page must be a positive integer.');
  if (!Number.isInteger(pageSize) || pageSize < 1)
    throw err.invalidArg('pageSize must be a positive integer.');

  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return { total: 0, page, pageSize, totalPages: 0, results: [] };
  }

  // Collect matches (skip the synthetic root itself).
  const matches = [];
  for (const node of store.nodes.values()) {
    if (node.id === ROOT_ID) continue;
    if (type !== 'all' && node.type !== type) continue;
    if (node.name.toLowerCase().includes(needle)) {
      const path = store.pathOf(node.id);
      matches.push(
        Object.freeze({
          id: node.id,
          name: node.name,
          type: node.type,
          parentId: node.parentId,
          path, // array of names from root -> item
          pathString: path.join(' / '),
        })
      );
    }
  }

  // Sort.
  const dir = sortDir === 'asc' ? 1 : -1;
  matches.sort((a, b) => {
    let cmp;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'type') cmp = a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    else cmp = a.pathString.localeCompare(b.pathString);
    return cmp * dir;
  });

  // Paginate.
  const total = matches.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const results = matches.slice(start, start + pageSize);

  return Object.freeze({ total, page, pageSize, totalPages, results: Object.freeze(results) });
}

export { NodeType };
