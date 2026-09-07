import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { QuestionFileSchema, type Question } from "./schema";

/**
 * Node-side content loading. The browser never reads YAML — `validate:content`
 * emits a checked JSON bundle (lib/content/generated.json) that the client
 * imports, so invalid content cannot reach a running app.
 */

export const CONTENT_ROOT = join(process.cwd(), "content");

export function listContentFiles(root: string = CONTENT_ROOT): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) out.push(full);
    }
  };

  walk(root);
  return out.sort();
}

export interface LoadedFile {
  path: string;
  questions: Question[];
}

export class ContentError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

export function loadFile(path: string): LoadedFile {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ContentError(path, `YAML did not parse — ${(err as Error).message}`);
  }

  const parsed = QuestionFileSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ContentError(path, `schema violation\n${detail}`);
  }

  return { path, questions: parsed.data.questions };
}

export function loadAll(root: string = CONTENT_ROOT): LoadedFile[] {
  return listContentFiles(root).map(loadFile);
}
