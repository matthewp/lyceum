import { execFile } from "node:child_process";

const CMD_PREFIX = process.env.CALIBRE_CMD_PREFIX?.split(/\s+/).filter(Boolean) ?? [];
const LIBRARY_PATH = process.env.CALIBRE_LIBRARY_PATH
  ?? (process.env.CALIBRE_DB_PATH?.replace(/\/metadata\.db$/, ""))
  ?? `${process.env.HOME}/calibre-library`;

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const fullArgs = CMD_PREFIX.length
    ? [...CMD_PREFIX.slice(1), cmd, ...args]
    : args;
  const bin = CMD_PREFIX.length ? CMD_PREFIX[0] : cmd;

  return new Promise((resolve, reject) => {
    execFile(bin, fullArgs, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} failed: ${stderr || error.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function addBook(filePath: string): Promise<string> {
  const { stdout } = await run("calibredb", [
    "add", filePath,
    "--library-path", LIBRARY_PATH,
  ]);
  return stdout.trim();
}

export async function fetchMetadata(title: string, authors?: string): Promise<string> {
  const args = ["--title", title];
  if (authors) args.push("--authors", authors);
  const { stdout } = await run("fetch-ebook-metadata", args);
  return stdout.trim();
}

export async function setMetadata(
  bookId: number,
  fields: Record<string, string>
): Promise<string> {
  const args = ["set_metadata", String(bookId), "--library-path", LIBRARY_PATH];
  for (const [key, value] of Object.entries(fields)) {
    args.push("--field", `${key}:${value}`);
  }
  const { stdout } = await run("calibredb", args);
  return stdout.trim();
}

export async function convertBook(
  inputPath: string,
  outputPath: string
): Promise<string> {
  const { stdout } = await run("ebook-convert", [inputPath, outputPath]);
  return stdout.trim();
}

export async function removeBook(bookId: number): Promise<string> {
  const { stdout } = await run("calibredb", [
    "remove", String(bookId),
    "--library-path", LIBRARY_PATH,
  ]);
  return stdout.trim();
}
