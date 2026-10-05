import "server-only";

const ALLOWED_MODULES = new Set([
  "collections",
  "csv",
  "datetime",
  "decimal",
  "json",
  "math",
  "statistics",
]);

const BANNED_PATTERNS = [
  /__/, /\beval\s*\(/, /\bexec\s*\(/, /\bcompile\s*\(/,
  /\bglobals\s*\(/, /\blocals\s*\(/, /\bgetattr\s*\(/,
  /\bsetattr\s*\(/, /\bdelattr\s*\(/, /\bbreakpoint\s*\(/,
];

// Blanks out comment and string-literal bodies so the import scan reads code
// only and never trips on the word "import" inside a message. Newlines are
// preserved so line structure survives.
function blankLiteralsAndComments(code: string): string {
  let out = "";
  let index = 0;

  while (index < code.length) {
    const character = code[index];

    if (character === "#") {
      while (index < code.length && code[index] !== "\n") {
        out += " ";
        index += 1;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      const candidate = code.slice(index, index + 3);
      const delimiter = candidate === '"""' || candidate === "'''" ? candidate : character;
      out += " ".repeat(delimiter.length);
      index += delimiter.length;

      while (index < code.length && code.slice(index, index + delimiter.length) !== delimiter) {
        if (code[index] === "\\" && index + 1 < code.length) {
          out += code[index + 1] === "\n" ? " \n" : "  ";
          index += 2;
          continue;
        }
        out += code[index] === "\n" ? "\n" : " ";
        index += 1;
      }

      out += " ".repeat(Math.min(delimiter.length, code.length - index));
      index += delimiter.length;
      continue;
    }

    out += character;
    index += 1;
  }

  return out;
}

// A line-anchored match misses an import tucked into a compound statement
// (`if True: import os`) or behind a semicolon (`total = 0; import os`), so
// each line is split on the statement separators before it is checked.
function statementSegments(code: string): string[] {
  return blankLiteralsAndComments(code)
    .split("\n")
    .flatMap((line) => line.split(/[;:]/));
}

export function validateGeneratedPython(code: string) {
  if (!code.trim()) throw new Error("The model returned empty Python code.");
  if (code.length > 12_000) throw new Error("Generated Python exceeded the code-size limit.");
  if (code.includes("```")) throw new Error("Generated Python contained Markdown fences.");

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(code)) throw new Error("Generated Python failed the static policy check.");
  }

  for (const segment of statementSegments(code)) {
    const directImport = segment.match(/^\s*import\s+(.+)$/);
    if (directImport) {
      const modules = directImport[1].split(",").map((entry) => entry.trim().split(/\s+as\s+/)[0].split(".")[0]);
      if (modules.some((moduleName) => !ALLOWED_MODULES.has(moduleName))) {
        throw new Error("Generated Python requested a module outside the allowlist.");
      }
    }

    const fromImport = segment.match(/^\s*from\s+([\w.]+)\s+import\s+/);
    if (fromImport && !ALLOWED_MODULES.has(fromImport[1].split(".")[0])) {
      throw new Error("Generated Python requested a module outside the allowlist.");
    }
  }

  const openCalls = code.match(/\bopen\s*\(/g)?.length ?? 0;
  const allowedOpenCalls = code.match(/\bopen\s*\(\s*["']\/vercel\/sandbox\/input\.csv["']/g)?.length ?? 0;
  if (openCalls !== allowedOpenCalls || openCalls !== 1) {
    throw new Error("Generated Python must read only the configured CSV path.");
  }
  if (!/print\s*\(\s*json\.dumps\s*\(/.test(code)) {
    throw new Error("Generated Python must emit the required JSON result.");
  }
}
