const seedModules = import.meta.glob('../content/bandas/*.md', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>;

export type SeedMarkdown = {
	id: string;
	markdown: string;
};

export function listSeedMarkdown(): SeedMarkdown[] {
	return Object.entries(seedModules).map(([modulePath, markdown]) => {
		const file = modulePath.split('/').pop() ?? modulePath;
		const id = file.replace(/\.md$/, '');
		return { id, markdown };
	});
}

const seedIds = new Set(listSeedMarkdown().map((item) => item.id));

export function isSeedId(id: string) {
	return seedIds.has(id);
}
