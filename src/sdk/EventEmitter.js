// EventEmitter — a tiny, hand-written pub/sub (no third-party libs, per task
// constraint #3). Used by the SDK to notify subscribers when the file
// structure changes.
//
// `subscribe` returns an *unsubscribe* function, which is the ergonomic
// pattern React effects expect (return it straight from useEffect).

export class EventEmitter {
  constructor() {
    this._listeners = new Set();
  }

  // Register a listener. Returns a function that removes it.
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function.');
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // Emit an event to all current listeners. We iterate over a copy so a
  // listener that unsubscribes during emission does not break iteration.
  emit(payload) {
    for (const listener of Array.from(this._listeners)) {
      listener(payload);
    }
  }

  get size() {
    return this._listeners.size;
  }

  clear() {
    this._listeners.clear();
  }
}
