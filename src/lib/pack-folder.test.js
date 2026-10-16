import { describe, it, expect, beforeAll } from 'vitest';
import { folderFromFileList, findPacks, loadPack } from './pack-folder.js';
import { assetUrl } from './renderer/prepare-stylesheet.js';

/** Files the way <input webkitdirectory> hands them over: paths start with the picked folder. */
function pickedFiles(entries) {
	return Object.entries(entries).map(([path, text]) => {
		const file = new File([text], path.split('/').at(-1));
		Object.defineProperty(file, 'webkitRelativePath', { value: path });
		return file;
	});
}

const MANIFEST = JSON.stringify({ id: 'demo', layout: 'layout.json', styles: ['style.css'] });

beforeAll(() => {
	let n = 0;
	URL.createObjectURL ??= () => `blob:test/${n++}`;
	URL.revokeObjectURL ??= () => {};
});

describe('findPacks', () => {
	it('a folder with a manifest.json is the pack', async () => {
		const folder = folderFromFileList(pickedFiles({ 'demo/manifest.json': MANIFEST, 'demo/layout.json': '{}' }));
		expect((await findPacks(folder)).map((p) => p.name)).toEqual(['demo']);
	});

	it('a folder of packs offers each subfolder with a manifest.json', async () => {
		const folder = folderFromFileList(
			pickedFiles({
				'packs/b-pack/manifest.json': MANIFEST,
				'packs/a-pack/manifest.json': MANIFEST,
				'packs/docs/readme.md': '# not a pack',
			}),
		);
		expect((await findPacks(folder)).map((p) => p.name)).toEqual(['a-pack', 'b-pack']);
	});

	it('finds nothing in a folder without packs', async () => {
		const folder = folderFromFileList(pickedFiles({ 'stuff/readme.md': 'hi' }));
		expect(await findPacks(folder)).toEqual([]);
	});
});

describe('loadPack', () => {
	it('reads the manifest-named files and maps assets to URLs', async () => {
		const [pack] = await findPacks(
			folderFromFileList(
				pickedFiles({
					'demo/manifest.json': MANIFEST,
					'demo/layout.json': '{"type":"box"}',
					'demo/style.css': '.a{}',
					'demo/preview-data.json': '{"x":1}',
					'demo/assets/fonts/Pixel.ttf': 'font',
				}),
			),
		);
		const loaded = await loadPack(pack);
		expect(loaded.layoutJson).toBe('{"type":"box"}');
		expect(loaded.styleCss).toBe('.a{}');
		expect(loaded.previewDataJson).toBe('{"x":1}');
		expect(loaded.canSave).toBe(false);
		expect(loaded.assetUrl('fonts/Pixel.ttf')).toMatch(/^blob:/);
		expect(loaded.assetUrl('fonts/Missing.ttf')).toBe('missing-asset:fonts/Missing.ttf');
	});
});

describe('assetUrl', () => {
	it('prefixes a base path or calls a resolver', () => {
		expect(assetUrl('/packs/x', 'fonts/a.ttf')).toBe('/packs/x/assets/fonts/a.ttf');
		expect(assetUrl((p) => `blob:${p}`, 'fonts/a.ttf')).toBe('blob:fonts/a.ttf');
	});
});
