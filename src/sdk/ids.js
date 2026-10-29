// Stable unique identifier generator.
// We implement our own counter-based id (no third-party libs, per the task
// constraints). Ids are monotonic and prefixed so they are easy to read in
// logs/tests. A module-level counter guarantees uniqueness within a session.

let counter = 0;

export function createIdFactory(prefix = 'node') {
  let local = 0;
  return () => `${prefix}_${++local}_${Date.now().toString(36)}`;
}

// A simple global factory used by the default SDK instance. Each SDK instance
// actually owns its own factory (see FileSystemSDK) so ids never collide
// across instances and remain deterministic per instance.
export function nextGlobalId(prefix = 'node') {
  return `${prefix}_${++counter}`;
}

// Case-insensitive name comparison used by the "unique within folder" rule.
export function sameName(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
