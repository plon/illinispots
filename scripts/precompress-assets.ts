import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import {
  brotliCompress,
  constants,
  gzip,
} from "node:zlib";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const ASSET_DIRECTORY = "./dist/client";
const MINIMUM_SIZE_BYTES = 1_024;
const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);

async function collectCompressibleFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectCompressibleFiles(path);
      if (!entry.isFile() || !COMPRESSIBLE_EXTENSIONS.has(extname(entry.name))) {
        return [];
      }

      const metadata = await stat(path);
      return metadata.size >= MINIMUM_SIZE_BYTES ? [path] : [];
    }),
  );

  return nestedFiles.flat();
}

async function precompress(path: string): Promise<void> {
  const source = await readFile(path);
  const [brotli, gzipped] = await Promise.all([
    brotliCompressAsync(source, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 10,
      },
    }),
    gzipAsync(source, { level: 9 }),
  ]);

  await Promise.all([
    writeFile(`${path}.br`, brotli),
    writeFile(`${path}.gz`, gzipped),
  ]);
}

const files = await collectCompressibleFiles(ASSET_DIRECTORY);
await Promise.all(files.map(precompress));

const sourceBytes = (
  await Promise.all(files.map(async (path) => (await stat(path)).size))
).reduce((total, size) => total + size, 0);
const brotliBytes = (
  await Promise.all(files.map(async (path) => (await stat(`${path}.br`)).size))
).reduce((total, size) => total + size, 0);

console.log(
  `Precompressed ${files.length} assets: ${sourceBytes} bytes -> ${brotliBytes} bytes Brotli`,
);
