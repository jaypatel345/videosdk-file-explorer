// History — undo/redo stacks built on inverse commands.
//
// Model
// -----
// Every successful mutation (or committed transaction) produces an "entry":
//   { label, do(), undo() }
// where `do` re-applies the change and `undo` reverts it. We keep two stacks:
//   * undoStack: entries that can be undone (most recent on top)
//   * redoStack: entries that were undone and can be re-applied
//
// Behaviour (as required by the task)
// -----------------------------------
//  * push(entry): records a new entry and CLEARS the redo stack — performing a
//    new operation after an undo discards the "future" that was undone.
//  * undo(): pops from undoStack, runs entry.undo(), pushes onto redoStack.
//  * redo(): pops from redoStack, runs entry.do(),  pushes onto undoStack.
//  * Failed operations never call push(), so they create no history entry.

export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  push(entry) {
    this.undoStack.push(entry);
    // A fresh action invalidates any previously undone (redoable) actions.
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return null;
    const entry = this.undoStack.pop();
    entry.undo();
    this.redoStack.push(entry);
    return entry;
  }

  redo() {
    if (!this.canRedo()) return null;
    const entry = this.redoStack.pop();
    entry.do();
    this.undoStack.push(entry);
    return entry;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  // Lightweight description of history state for UI (activity / buttons).
  describe() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      nextUndoLabel: this.canUndo()
        ? this.undoStack[this.undoStack.length - 1].label
        : null,
      nextRedoLabel: this.canRedo()
        ? this.redoStack[this.redoStack.length - 1].label
        : null,
    };
  }
}
