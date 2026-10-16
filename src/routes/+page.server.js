import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PACKS_DIR, isPackDir } from '../lib/server/packs-dir.js';

export function load() {
	const packIds = readdirSync(PACKS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && isPackDir(join(PACKS_DIR, entry.name)))
		.map((entry) => entry.name)
		.sort();
	return { packIds };
}
