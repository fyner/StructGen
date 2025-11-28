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
      // Formatas: path: file1, file2  ARBA tik failai: : file1, file2
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

      // Tik failai root'e (be kelio)
      if (!pathPart && files.length > 0) {
        result.push({
          directory: '',
          files
        });
        continue;
      }

      if (!pathPart) {
        // nei kelio, nei failų – ignoruojame
        continue;
      }

      // Katalogas su galimais failais (failai gali būti ir tušti)
      result.push({
        directory: pathPart,
        files
      });
    } else {
      // Tik katalogų kelias be failų
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


