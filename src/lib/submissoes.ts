import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { env } from 'cloudflare:workers';

const ROOT = path.join(process.cwd(), 'data', 'submissoes');
const IMAGENS = path.join(ROOT, 'imagens');

const MD_PREFIX = 'md:';
const IMG_PREFIX = 'img:';
const META_PREFIX = 'img-meta:';

export type ImagemMeta = {
	contentType: string;
	filename: string;
	ext: string;
};

export type SavedSubmissao = {
	id: string;
	markdown: string;
	imagemPath?: string;
};

async function tryWriteDisk(options: {
	id: string;
	markdown: string;
	imagem?: { bytes: Uint8Array; meta: ImagemMeta } | null;
}) {
	try {
		await mkdir(IMAGENS, { recursive: true });
		await writeFile(path.join(ROOT, `${options.id}.md`), options.markdown, 'utf8');
		if (options.imagem) {
			await writeFile(
				path.join(IMAGENS, `${options.id}.${options.imagem.meta.ext}`),
				options.imagem.bytes,
			);
		}
		return true;
	} catch {
		return false;
	}
}

async function mirrorViaDevServer(options: {
	id: string;
	markdown: string;
	imagem?: { bytes: Uint8Array; meta: ImagemMeta } | null;
	origin?: string;
}) {
	if (!options.origin) return;
	try {
		await fetch(new URL('/__dev/mirror-submissao', options.origin), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: options.id,
				markdown: options.markdown,
				imagem: options.imagem
					? {
							meta: options.imagem.meta,
							base64: Buffer.from(options.imagem.bytes).toString('base64'),
						}
					: null,
			}),
		});
	} catch {
		// espelho só existe no astro dev
	}
}

export async function saveSubmissao(options: {
	id: string;
	markdown: string;
	email?: string;
	imagem?: { bytes: Uint8Array; meta: ImagemMeta } | null;
	origin?: string;
}): Promise<SavedSubmissao> {
	const { id, markdown, email, imagem, origin } = options;
	let imagemPath: string | undefined;

	await env.SUBMISSOES.put(`${MD_PREFIX}${id}`, markdown);
	if (email) {
		await env.SUBMISSOES.put(`meta:${id}`, JSON.stringify({ email, savedAt: new Date().toISOString() }));
	}

	if (imagem) {
		await env.SUBMISSOES.put(`${IMG_PREFIX}${id}`, imagem.bytes, {
			metadata: imagem.meta,
		});
		await env.SUBMISSOES.put(`${META_PREFIX}${id}`, JSON.stringify(imagem.meta));
		imagemPath = `/media/submissoes/${id}.${imagem.meta.ext}`;
	}

	const wrote = await tryWriteDisk({ id, markdown, imagem });
	if (!wrote) {
		await mirrorViaDevServer({ id, markdown, imagem, origin });
	}

	return { id, markdown, imagemPath };
}

export async function listSubmissaoMarkdown(): Promise<Array<{ id: string; markdown: string }>> {
	const byId = new Map<string, string>();

	try {
		const files = await readdir(ROOT);
		for (const file of files) {
			if (!file.endsWith('.md')) continue;
			const id = file.replace(/\.md$/, '');
			const markdown = await readFile(path.join(ROOT, file), 'utf8');
			byId.set(id, markdown);
		}
	} catch {
		// pasta ainda inexistente ou FS indisponível no Worker
	}

	let cursor: string | undefined;
	do {
		const page = await env.SUBMISSOES.list({ prefix: MD_PREFIX, cursor });
		for (const key of page.keys) {
			const id = key.name.slice(MD_PREFIX.length);
			if (byId.has(id)) continue;
			const value = await env.SUBMISSOES.get(key.name);
			if (value) byId.set(id, value);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	return [...byId.entries()].map(([id, markdown]) => ({ id, markdown }));
}

export async function getSubmissaoImagem(id: string): Promise<{
	bytes: Uint8Array;
	meta: ImagemMeta;
} | null> {
	const metaRaw = await env.SUBMISSOES.get(`${META_PREFIX}${id}`);
	const meta = metaRaw ? (JSON.parse(metaRaw) as ImagemMeta) : null;

	if (meta) {
		try {
			const bytes = await readFile(path.join(IMAGENS, `${id}.${meta.ext}`));
			return { bytes: new Uint8Array(bytes), meta };
		} catch {
			// cai no KV
		}
	}

	const stored = await env.SUBMISSOES.get(`${IMG_PREFIX}${id}`, 'arrayBuffer');
	if (!stored) {
		try {
			const files = await readdir(IMAGENS);
			const match = files.find((f) => f.startsWith(`${id}.`));
			if (match) {
				const ext = match.split('.').pop() ?? 'bin';
				const bytes = await readFile(path.join(IMAGENS, match));
				return {
					bytes: new Uint8Array(bytes),
					meta: { contentType: contentTypeForExt(ext), filename: match, ext },
				};
			}
		} catch {
			// ignore
		}
		return null;
	}

	const fallbackMeta: ImagemMeta = meta ?? {
		contentType: 'application/octet-stream',
		filename: id,
		ext: 'bin',
	};

	return { bytes: new Uint8Array(stored), meta: fallbackMeta };
}

export function contentTypeForExt(ext: string) {
	switch (ext.toLowerCase()) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'png':
			return 'image/png';
		case 'webp':
			return 'image/webp';
		case 'gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}

export function extForContentType(type: string) {
	switch (type) {
		case 'image/jpeg':
			return 'jpg';
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/gif':
			return 'gif';
		default:
			return null;
	}
}
