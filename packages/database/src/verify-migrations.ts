import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");
const journalPath = join(migrationsDir, "meta", "_journal.json");

function migrationPrefix(filename: string): string {
  return filename.slice(0, 4);
}

async function main() {
  const sqlFiles = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries?: Array<{ tag?: string }>;
  };
  const journalTags = new Set((journal.entries ?? []).map((entry) => entry.tag).filter(Boolean));

  const prefixes = new Map<string, string[]>();
  for (const file of sqlFiles) {
    const prefix = migrationPrefix(file);
    prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), file]);
  }

  const duplicatePrefixes = [...prefixes.values()].filter((files) => files.length > 1);
  const missingJournalEntries = sqlFiles.filter((file) => {
    const tag = basename(file, ".sql");
    return !journalTags.has(tag);
  });

  if (duplicatePrefixes.length > 0 || missingJournalEntries.length > 0) {
    console.error("Migration verification failed.");
    if (duplicatePrefixes.length > 0) {
      console.error("Duplicate numeric prefixes:");
      for (const files of duplicatePrefixes) {
        console.error(`- ${files.join(", ")}`);
      }
    }
    if (missingJournalEntries.length > 0) {
      console.error("SQL files missing from drizzle journal:");
      for (const file of missingJournalEntries) {
        console.error(`- ${file}`);
      }
    }
    process.exit(1);
  }

  console.log(`Migration verification passed (${sqlFiles.length} files).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
