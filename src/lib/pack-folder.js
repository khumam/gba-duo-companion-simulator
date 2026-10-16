/**
 * Reads a pack straight from a folder the user picks in the browser — nothing is listed or
 * served from disk by the dev server.
 *
 * Two ways in:
 * - showDirectoryPicker (Chromium): read/write, so editor changes save back to the files.
 * - <input webkitdirectory> (every browser): read-only snapshot of the folder.
 *
 * The picked folder is either a pack (it has a manifest.json) or a folder of packs (each
 * subfolder that has a manifest.json is offered).
 */

export const canSaveToFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Opens the folder picker; resolves to a directory handle, or null if the user cancelled. */
export async function pickFolder() {
	try {
		return await window.showDirectoryPicker({ mode: 'readwrite' });
	} catch (e) {
		if (e?.name === 'AbortError') return null;
		throw e;
	}
}

// ---- a uniform, read-only "folder" view over both sources --------------------------------

/** @typedef {{ name: string, file(path: string): Promise<File|null>, childFolders(): Promise<Folder[]>, files(prefix: string): Promise<{path: string, file: File}[]>, handle?: FileSystemDirectoryHandle }} Folder */

/** A Folder over a FileSystemDirectoryHandle. */
export function folderFromHandle(handle) {
	async function resolveFile(path) {
		const parts = path.split('/').filter(Boolean);
		let dir = handle;
		try {
			for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
			return await (await dir.getFileHandle(parts.at(-1))).getFile();
		} catch {
			return null;
		}
	}
	return {
		name: handle.name,
		handle,
		file: resolveFile,
		async childFolders() {
			const out = [];
			for await (const entry of handle.values()) {
				if (entry.kind === 'directory') out.push(folderFromHandle(entry));
			}
			return out;
		},
		async files(prefix) {
			const out = [];
			let dir = handle;
			try {
				for (const part of prefix.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part);
			} catch {
				return out;
			}
			async function walk(d, rel) {
				for await (const entry of d.values()) {
					const path = rel ? `${rel}/${entry.name}` : entry.name;
					if (entry.kind === 'directory') await walk(entry, path);
					else out.push({ path, file: await entry.getFile() });
				}
			}
			await walk(dir, '');
			return out;
		},
	};
}

/** A Folder over the FileList from <input webkitdirectory> (paths are "picked/..."). */
export function folderFromFileList(fileList) {
	const all = [...fileList].map((file) => ({ path: file.webkitRelativePath, file }));
	const rootName = all[0]?.path.split('/')[0] ?? '';
	return subFolder(
		rootName,
		all.map(({ path, file }) => ({ path: path.slice(rootName.length + 1), file })),
	);

	function subFolder(name, entries) {
		return {
			name,
			async file(path) {
				return entries.find((e) => e.path === path)?.file ?? null;
			},
			async childFolders() {
				const names = [...new Set(entries.filter((e) => e.path.includes('/')).map((e) => e.path.split('/')[0]))];
				return names.map((child) =>
					subFolder(
						child,
						entries
							.filter((e) => e.path.startsWith(`${child}/`))
							.map((e) => ({ path: e.path.slice(child.length + 1), file: e.file })),
					),
				);
			},
			async files(prefix) {
				const p = prefix.endsWith('/') ? prefix : `${prefix}/`;
				return entries.filter((e) => e.path.startsWith(p)).map((e) => ({ path: e.path.slice(p.length), file: e.file }));
			},
		};
	}
}

/** The packs in a picked folder: the folder itself if it's a pack, else its pack subfolders. */
export async function findPacks(folder) {
	if (await folder.file('manifest.json')) return [folder];
	const packs = [];
	for (const child of await folder.childFolders()) {
		if (await child.file('manifest.json')) packs.push(child);
	}
	return packs.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- loading and saving one pack ---------------------------------------------------------

async function textOf(folder, path) {
	const file = await folder.file(path);
	return file ? file.text() : null;
}

/**
 * Loads a pack's manifest, editor files and assets. `assetUrl(path)` maps a path under the
 * pack's assets/ folder to a blob URL; call `dispose()` when switching away to free them.
 */
export async function loadPack(folder) {
	const manifestText = await textOf(folder, 'manifest.json');
	if (manifestText == null) throw new Error(`${folder.name} has no manifest.json`);
	const manifest = JSON.parse(manifestText);

	const layoutFile = manifest.layout ?? 'layout.json';
	const styleFiles = Array.isArray(manifest.styles) ? manifest.styles : [];
	const styleTexts = await Promise.all(styleFiles.map((f) => textOf(folder, f)));

	const blobUrls = new Map();
	for (const { path, file } of await folder.files('assets')) blobUrls.set(path, URL.createObjectURL(file));

	return {
		folder,
		manifest,
		layoutFile,
		styleFiles,
		layoutJson: (await textOf(folder, layoutFile)) ?? '',
		styleCss: styleTexts.filter((t) => t != null).join('\n'),
		previewDataJson: await textOf(folder, 'preview-data.json'),
		canSave: Boolean(folder.handle),
		assetUrl: (path) => blobUrls.get(path) ?? `missing-asset:${path}`,
		dispose: () => blobUrls.forEach((url) => URL.revokeObjectURL(url)),
	};
}

/**
 * Writes one editor tab back to its file: `layout` → the manifest's layout file, `style` →
 * its only stylesheet (several can't be split back apart), `previewData` → preview-data.json.
 */
export async function savePackFile(pack, which, content) {
	if (!pack.canSave) throw new Error('this folder was opened read-only');
	let fileName;
	if (which === 'layout') fileName = pack.layoutFile;
	else if (which === 'previewData') fileName = 'preview-data.json';
	else {
		if (pack.styleFiles.length !== 1) {
			throw new Error(`manifest declares ${pack.styleFiles.length} style files, expected exactly 1`);
		}
		fileName = pack.styleFiles[0];
	}
	const parts = fileName.split('/').filter(Boolean);
	let dir = pack.folder.handle;
	for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
	const writable = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
	await writable.write(content);
	await writable.close();
}
