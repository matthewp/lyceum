import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WASI } from "node:wasi";
import type { BookMetadata } from "./types.ts";

interface MobiExports {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  mobi_wasm_open: (ptr: number, len: number) => number;
  mobi_wasm_close: () => void;
  get_cover_data: () => number;
  get_cover_size: () => number;
  free_result: (ptr: number) => void;
}

let cachedInstance: WebAssembly.Instance | null = null;

async function getInstance(): Promise<WebAssembly.Instance> {
  if (cachedInstance) return cachedInstance;

  const wasi = new WASI({ version: "preview1" });
  const wasmPath = join(import.meta.dirname!, "mobi.wasm");
  const wasmBuf = readFileSync(wasmPath);
  const compiled = await WebAssembly.compile(wasmBuf);
  const instance = await WebAssembly.instantiate(compiled, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  wasi.start(instance);
  cachedInstance = instance;
  return instance;
}

function readCString(mem: Uint8Array, ptr: number): string {
  let end = ptr;
  while (mem[end] !== 0) end++;
  return new TextDecoder().decode(mem.slice(ptr, end));
}

export async function extractMobi(data: Buffer): Promise<BookMetadata> {
  const instance = await getInstance();
  const exports = instance.exports as unknown as MobiExports;

  // Copy file data into WASM memory
  const ptr = exports.malloc(data.length);
  const heap = new Uint8Array(exports.memory.buffer);
  heap.set(data, ptr);

  // Parse and extract metadata
  const jsonPtr = exports.mobi_wasm_open(ptr, data.length);
  exports.free(ptr);

  if (!jsonPtr) {
    return {
      title: null,
      authors: [],
      publisher: null,
      description: null,
      date: null,
      language: null,
      isbn: null,
      cover: null,
      subjects: [],
    };
  }

  const mem = new Uint8Array(exports.memory.buffer);
  const jsonStr = readCString(mem, jsonPtr);
  exports.free_result(jsonPtr);

  const raw = JSON.parse(jsonStr);

  // Read cover image before closing
  let cover: Buffer | null = null;
  const coverSize = exports.get_cover_size();
  const coverPtr = exports.get_cover_data();
  if (coverPtr && coverSize > 0) {
    const coverMem = new Uint8Array(exports.memory.buffer);
    cover = Buffer.from(coverMem.slice(coverPtr, coverPtr + coverSize));
  }

  exports.mobi_wasm_close();

  // Parse subjects (semicolon-separated from libmobi)
  const subjects: string[] = raw.subject
    ? raw.subject.split(/;\s*/).filter((s: string) => s.length > 0)
    : [];

  return {
    title: raw.title || null,
    authors: raw.author
      ? raw.author.split(/;\s*/).filter((s: string) => s.length > 0)
      : [],
    publisher: raw.publisher || null,
    description: raw.description || null,
    date: raw.date || null,
    language: raw.language || null,
    isbn: raw.isbn || null,
    cover,
    subjects,
  };
}
