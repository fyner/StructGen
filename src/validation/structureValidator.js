const path = require('path');
const { parseStructureInput } = require('../parser');

// Windows file naming rules reference:
// https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
//
// We apply a subset of these rules to each *segment* of the structure:
// - directory segments (split by '/')
// - file names
//
// This module does NOT know anything about the DOM or Electron – it only
// returns a structured list of validation errors that the renderer/main
// processes can present however they like.

// Characters that are forbidden in Windows file / directory names.
// See "Naming Conventions" section in the docs.
const INVALID_CHARS_RE = /[<>:"/\\|?*]/;

// ASCII control chars 0–31 are also forbidden in names.
const CONTROL_CHARS_RE = /[\x00-\x1F]/;

// Reserved device names. Comparison is case-insensitive and applies to
// the *base* name (before the dot), even if there is an extension.
const RESERVED_BASE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
]);

function isReservedBaseName(name) {
  const base = String(name || '').split('.')[0].toUpperCase();
  return RESERVED_BASE_NAMES.has(base);
}

function checkSegmentName(segment, context) {
  const errors = [];
  const value = String(segment || '');
  const where = context && context.where === 'file' ? 'file' : 'directory';

  if (!value) {
    return errors;
  }

  // Rule: reject special dot segments that would have path semantics ('.' or '..').
  // In the user-facing structure definition we want only *real* directory/file names,
  // not relative path components.
  if (value === '.' || value === '..') {
    errors.push({
      code: 'DOT_SEGMENT',
      messageKey: where === 'file' ? 'dotSegmentFileNotAllowed' : 'dotSegmentDirNotAllowed',
      ...context,
      segment: value
    });
  }

  // Rule: enforce a reasonable maximum length for a single segment.
  // Windows allows up to 255 characters for a file or directory name on NTFS,
  // so we treat anything above that as invalid even before hitting the file system.
  if (value.length > 255) {
    errors.push({
      code: 'SEGMENT_TOO_LONG',
      messageKey: where === 'file' ? 'segmentFileTooLong' : 'segmentDirTooLong',
      ...context,
      segment: value,
      length: value.length,
      maxLength: 255
    });
  }

  // Rule: forbidden characters
  if (INVALID_CHARS_RE.test(value) || CONTROL_CHARS_RE.test(value)) {
    errors.push({
      code: 'INVALID_CHAR',
      messageKey: where === 'file' ? 'invalidFileChar' : 'invalidDirChar',
      ...context,
      segment: value
    });
  }

  // Rule: reserved device names (base name, case-insensitive)
  if (isReservedBaseName(value)) {
    errors.push({
      code: 'RESERVED_NAME',
      messageKey: where === 'file' ? 'reservedFileName' : 'reservedDirName',
      ...context,
      segment: value
    });
  }

  // Rule: do not end with space or dot
  if (/[ .]$/.test(value)) {
    errors.push({
      code: 'TRAILING_DOT_OR_SPACE',
      messageKey: where === 'file' ? 'trailingDotOrSpaceFile' : 'trailingDotOrSpaceDir',
      ...context,
      segment: value
    });
  }

  return errors;
}

/**
 * Central place for validating the raw structure input.
 *
 * Behaviour:
 * - parses the text into `{ directory, files }` via `parseStructureInput`
 * - walks over all directory segments & file names
 * - collects validation errors based on Windows naming rules
 * - `isValid` is true only when there are no errors
 */
function validateStructureInput(raw, options = {}) {
  const parsed = parseStructureInput(raw);

  const errors = [];

  // Raw lines, so we can attach a 1-based line number to each error and
  // potentially highlight the offending line in the UI.
  const rawLines = (typeof raw === 'string' ? raw.split(/\r?\n/) : []).map((line, index) => ({
    lineNumber: index + 1,
    raw: line
  }));

  // Optional full-path length constraint. If `rootDir` is provided, we check
  // the approximate length of `rootDir + relativePath` against a configurable
  // limit (default 260 characters, inspired by classic MAX_PATH).
  const rootDir = options && options.rootDir ? path.resolve(options.rootDir) : null;
  const maxFullPathLength =
    typeof options.maxFullPathLength === 'number' && options.maxFullPathLength > 0
      ? options.maxFullPathLength
      : 260;

  // Validate each *raw* line to get precise line numbers.
  rawLines.forEach(({ lineNumber, raw: rawLine }) => {
    const line = (rawLine || '').trim();
    if (!line) return;

    const colonIndex = line.indexOf(':');

    if (colonIndex >= 0) {
      const pathPart = line
        .slice(0, colonIndex)
        .trim();
      const filesPart = line
        .slice(colonIndex + 1)
        .trim();

      const files = filesPart
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      // Only files at root (no directory path)
      if (!pathPart && files.length > 0) {
        files.forEach((fileName) => {
          // Per-file naming rules (characters, reserved names, etc.)
          errors.push(
            ...checkSegmentName(fileName, {
              where: 'file',
              directory: null,
              line: lineNumber
            })
          );

          // Optional: full path length check for files directly under the root.
          if (rootDir && maxFullPathLength > 0) {
            const relativeFile = fileName;
            const targetFile = path.join(rootDir, fileName);
            if (targetFile.length > maxFullPathLength) {
              errors.push({
                code: 'PATH_TOO_LONG_FILE',
                messageKey: 'pathTooLongFile',
                where: 'file',
                directory: null,
                line: lineNumber,
                segment: fileName,
                relativePath: relativeFile,
                fullPath: targetFile,
                length: targetFile.length,
                maxLength: maxFullPathLength
              });
            }
          }
        });
        return;
      }

      if (!pathPart) {
        // Line like ":" or with commas but no path/files – format-wise invalid,
        // but we currently treat it as "ignored" to stay compatible with the
        // old parser behaviour.
        return;
      }

      const dirSegments = pathPart
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      dirSegments.forEach((seg) => {
        errors.push(
          ...checkSegmentName(seg, {
            where: 'directory',
            directory: pathPart || null,
            line: lineNumber
          })
        );
      });

      // Optional: full path length check for the directory path and each file.
      if (rootDir && maxFullPathLength > 0) {
        const dirRelative = pathPart || '';
        if (dirRelative) {
          const targetDir = path.join(rootDir, ...dirSegments);
          if (targetDir.length > maxFullPathLength) {
            const lastSegment = dirSegments[dirSegments.length - 1] || dirRelative;
            errors.push({
              code: 'PATH_TOO_LONG_DIR',
              messageKey: 'pathTooLongDir',
              where: 'directory',
              directory: dirRelative,
              line: lineNumber,
              segment: lastSegment,
              fullPath: targetDir,
              length: targetDir.length,
              maxLength: maxFullPathLength
            });
          }
        }

        files.forEach((fileName) => {
          const relativeFile = dirRelative ? path.posix.join(dirRelative, fileName) : fileName;
          const targetFile = path.join(rootDir, ...dirSegments, fileName);
          if (targetFile.length > maxFullPathLength) {
            errors.push({
              code: 'PATH_TOO_LONG_FILE',
              messageKey: 'pathTooLongFile',
              where: 'file',
              directory: dirRelative || null,
              line: lineNumber,
              segment: fileName,
              relativePath: relativeFile,
              fullPath: targetFile,
              length: targetFile.length,
              maxLength: maxFullPathLength
            });
          }
        });
      }

      files.forEach((fileName) => {
        errors.push(
          ...checkSegmentName(fileName, {
            where: 'file',
            directory: pathPart || null,
            line: lineNumber
          })
        );
      });
    } else {
      // Directory path only
      const pathOnly = line;
      if (!pathOnly) return;

      const dirSegments = pathOnly
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      dirSegments.forEach((seg) => {
        errors.push(
          ...checkSegmentName(seg, {
            where: 'directory',
            directory: pathOnly || null,
            line: lineNumber
          })
        );
      });

      // Optional: full path length check for a directory-only line.
      if (rootDir && maxFullPathLength > 0) {
        const dirRelative = pathOnly || '';
        if (dirRelative) {
          const targetDir = path.join(rootDir, ...dirSegments);
          if (targetDir.length > maxFullPathLength) {
            const lastSegment = dirSegments[dirSegments.length - 1] || dirRelative;
            errors.push({
              code: 'PATH_TOO_LONG_DIR',
              messageKey: 'pathTooLongDir',
              where: 'directory',
              directory: dirRelative,
              line: lineNumber,
              segment: lastSegment,
              fullPath: targetDir,
              length: targetDir.length,
              maxLength: maxFullPathLength
            });
          }
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    parsed,
    lines: rawLines
  };
}

module.exports = {
  validateStructureInput
};


