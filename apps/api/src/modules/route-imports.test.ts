import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

type ImportViolation = {
  file: string;
  line: number;
  source: string;
};

const modulesDir = dirname(fileURLToPath(import.meta.url));

function isRouteFile(fileName: string): boolean {
  return fileName === "routes.ts" || fileName.endsWith("-routes.ts");
}

async function collectRouteFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectRouteFiles(entryPath);
      }

      return isRouteFile(entry.name) ? [entryPath] : [];
    }),
  );

  return files.flat();
}

async function findRouteImportViolations(
  pattern: RegExp,
): Promise<ImportViolation[]> {
  const routeFiles = await collectRouteFiles(modulesDir);
  const violations: ImportViolation[] = [];

  for (const file of routeFiles) {
    const source = await readFile(file, "utf-8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        violations.push({
          file: relative(modulesDir, file),
          line: index + 1,
          source: line.trim(),
        });
      }
    });
  }

  return violations;
}

test("route files use local route service facades instead of importing ./service", async () => {
  const violations = await findRouteImportViolations(
    /from\s+["']\.\/service["']/,
  );

  assert.deepEqual(
    violations,
    [],
    `Routes should import workflow-specific helpers or route facades instead of ./service: ${JSON.stringify(
      violations,
      null,
      2,
    )}`,
  );
});

test("route files use local facades for selected cross-module services", async () => {
  const violations = await findRouteImportViolations(
    /from\s+["']\.\.\/(?:audit|auth|rbac|customers|ai-advisor|product-suppliers)\/service["']/,
  );

  assert.deepEqual(
    violations,
    [],
    `Routes should import selected cross-module services through local facades: ${JSON.stringify(
      violations,
      null,
      2,
    )}`,
  );
});

test("route files do not import cross-module service monoliths directly", async () => {
  const violations = await findRouteImportViolations(
    /from\s+["']\.\.\/[^"']+\/service["']/,
  );

  assert.deepEqual(
    violations,
    [],
    `Routes should depend on local route facades instead of cross-module service files: ${JSON.stringify(
      violations,
      null,
      2,
    )}`,
  );
});
