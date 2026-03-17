import { readFile, writeFile, mkdir, unlink, readdir, rename as fsRename, access } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  rename(oldKey: string, newKey: string): Promise<void>;
}

export class DiskFileStore implements FileStore {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      // ignore if already gone
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    try {
      return await readdir(this.resolve(prefix));
    } catch {
      return [];
    }
  }

  async rename(oldKey: string, newKey: string): Promise<void> {
    const oldPath = this.resolve(oldKey);
    const newPath = this.resolve(newKey);
    await mkdir(dirname(newPath), { recursive: true });
    await fsRename(oldPath, newPath);
  }
}
