import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export interface FileStore {
  put(key: string, data: Buffer): void;
  get(key: string): Buffer | null;
  delete(key: string): void;
  exists(key: string): boolean;
  list(prefix: string): string[];
}

export class DiskFileStore implements FileStore {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(key: string): string {
    return join(this.root, key);
  }

  put(key: string, data: Buffer): void {
    const path = this.resolve(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }

  get(key: string): Buffer | null {
    const path = this.resolve(key);
    try {
      return readFileSync(path);
    } catch {
      return null;
    }
  }

  delete(key: string): void {
    try {
      unlinkSync(this.resolve(key));
    } catch {
      // ignore if already gone
    }
  }

  exists(key: string): boolean {
    return existsSync(this.resolve(key));
  }

  list(prefix: string): string[] {
    const dir = this.resolve(prefix);
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }
}
