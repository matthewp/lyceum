import { build, context, type BuildOptions } from "esbuild";
import { readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pagesDir = join(root, "src", "pages");
const outDir = join(root, "public", "build");

function pageEntries(): Record<string, string> {
  const entries: Record<string, string> = { client: join(root, "src", "client.ts") };
  for (const f of readdirSync(pagesDir)) {
    if (!f.endsWith(".ts")) continue;
    if (f === "types.ts") continue;
    const name = f.replace(/\.ts$/, "");
    entries[`pages/${name}`] = join(pagesDir, f);
  }
  return entries;
}

function options(): BuildOptions {
  return {
    entryPoints: pageEntries(),
    bundle: true,
    format: "esm",
    splitting: true,
    target: ["es2022"],
    outdir: outDir,
    sourcemap: true,
    logLevel: "info",
    metafile: false,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[dir]/[name]",
  };
}

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await context(options());
  await ctx.watch();
  console.log("[build-client] watching…");
} else {
  await build(options());
  console.log("[build-client] done");
}
