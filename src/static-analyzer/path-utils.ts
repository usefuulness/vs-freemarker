import * as fs from 'fs';
import * as path from 'path';

export interface PathResolutionOptions {
  currentFile?: string;
  templateRoots?: string[];
}

/**
 * Attempts to resolve a template reference to an absolute filesystem path.
 *
 * The lookup order follows FreeMarker's semantics:
 *   1. Absolute paths that already exist on disk
 *   2. Paths relative to the current template
 *   3. Paths rooted at the configured template directories
 */
export function resolveTemplatePath(
  templateRef: string,
  options: PathResolutionOptions = {}
): string | undefined {
  if (!templateRef) {
    return undefined;
  }

  const normalizedRef = templateRef.replace(/["']/g, '').trim();
  const candidates: string[] = [];
  const templateRoots = options.templateRoots ?? [];
  const currentDir = options.currentFile ? path.dirname(options.currentFile) : undefined;
  const trimmedRef = normalizedRef.replace(/^[/\\]+/, '');

  const pushCandidate = (candidate: string | undefined): void => {
    if (!candidate) {
      return;
    }
    const normalized = path.normalize(candidate);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (path.isAbsolute(normalizedRef)) {
    pushCandidate(normalizedRef);
    templateRoots.forEach(root => pushCandidate(path.join(root, trimmedRef)));
  } else {
    if (currentDir) {
      pushCandidate(path.resolve(currentDir, normalizedRef));
    }
    templateRoots.forEach(root => {
      pushCandidate(path.join(root, trimmedRef));
      pushCandidate(path.resolve(root, normalizedRef));
    });
  }

  if (currentDir && trimmedRef && path.isAbsolute(normalizedRef)) {
    let dir = currentDir;
    const visited = new Set<string>();
    while (!visited.has(dir)) {
      visited.add(dir);
      pushCandidate(path.join(dir, trimmedRef));
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
