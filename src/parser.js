/**
 * Parse a free‑form textual structure definition into a normalized model.
 *
 * Input format (per line):
 *   - "path/to/dir: file1, file2"  -> directory with files
 *   - "path/to/dir"                -> directory only (no files)
 *   - ": file1, file2"             -> files directly under the root
 *
 * Empty lines are ignored. Whitespace around paths and file names is trimmed.
 */
function parseStructureInput(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result = [];

  for (const line of lines) {
    const colonIndex = line.indexOf(':');

    if (colonIndex >= 0) {
      // Format: "path: file1, file2" OR only files at root: ": file1, file2"
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

      // Only files in the root (no directory path before the colon)
      if (!pathPart && files.length > 0) {
        result.push({
          directory: '',
          files
        });
        continue;
      }

      // If we have neither a directory path nor any files – ignore this line.
      if (!pathPart) {
        continue;
      }

      // Directory with an optional file list (files may also be empty).
      result.push({
        directory: pathPart,
        files
      });
    } else {
      // Directory path with no files
      const pathOnly = line.trim();
      if (!pathOnly) continue;

      result.push({
        directory: pathOnly,
        files: []
      });
    }
  }

  return result;
}

module.exports = {
  parseStructureInput
};


