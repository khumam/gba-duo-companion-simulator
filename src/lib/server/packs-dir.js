import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Where the packs live: the sibling gbaduo-companions repo, each pack a folder at its root.
 * Set GBADUO_PACKS_DIR to point the simulator somewhere else.
 */
export const PACKS_DIR = resolve(process.env.GBADUO_PACKS_DIR ?? join(process.cwd(), '..', 'gbaduo-companions'));

/** A folder is a pack when it has a manifest.json (the repo root also holds .git, docs, ...). */
export function isPackDir(dir) {
	return existsSync(join(dir, 'manifest.json'));
}
