// Custom error type for all SDK validation / operation failures.
// Using a dedicated class lets consumers distinguish expected, meaningful
// SDK errors (e.g. "duplicate name") from unexpected programming errors.
// Each error carries a machine-readable `code` plus a human-readable message.

export const ErrorCodes = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  NOT_A_FOLDER: 'NOT_A_FOLDER',
  INVALID_MOVE: 'INVALID_MOVE',
  INVALID_TARGET: 'INVALID_TARGET',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
});

export class FileSystemError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
  }
}

// Convenience factories for common failures.
export const err = {
  notFound: (id) =>
    new FileSystemError(ErrorCodes.NOT_FOUND, `No item found with id "${id}".`),
  invalidArg: (msg) => new FileSystemError(ErrorCodes.INVALID_ARGUMENT, msg),
  duplicateName: (name, parentName) =>
    new FileSystemError(
      ErrorCodes.DUPLICATE_NAME,
      `An item named "${name}" already exists in "${parentName}".`
    ),
  notAFolder: (name) =>
    new FileSystemError(
      ErrorCodes.NOT_A_FOLDER,
      `"${name}" is a file; files cannot contain other items.`
    ),
  invalidMove: (msg) => new FileSystemError(ErrorCodes.INVALID_MOVE, msg),
  invalidTarget: (msg) => new FileSystemError(ErrorCodes.INVALID_TARGET, msg),
};
