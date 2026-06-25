import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "node_modules/@thatopen/components/dist/index.mjs",
  "node_modules/@thatopen/components-front/dist/index.js",
  "node_modules/@thatopen/components/dist/index.min.mjs",
  "node_modules/@thatopen/components-front/dist/index.min.js",
].map((file) => resolve(root, file));

for (const file of files) {
  let source = await readFile(file, "utf8");
  const patched = source.replace(/(\n\s*)import\(/g, '$1["import"](');
  if (patched !== source) {
    await writeFile(file, patched, "utf8");
    console.log(`Patched reserved import() method in ${file}`);
  }
}
