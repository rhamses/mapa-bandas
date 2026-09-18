import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { env } from 'cloudflare:workers';
import { parseMarkdown } from './markdown';

const ROOT = path.join(process.cwd(), 'data', 'submissoes');
const IMAGENS = path.join(ROOT, 'imagens');

const MD_PREFIX = 'md:';
const IMG_PREFIX = 'img:';
const META_PREFIX = 'img-meta:';
const RECORD_META_PREFIX = 'meta:';

export type ImagemMeta = {
	contentType: string;
	filename: string;
	ext: string;
};

export type SubmissaoStatus = 'pendente' | 'aprovada' | 'rejeitada';

export type SubmissaoMeta = {
	email?: string;
	savedAt: string;
	status: SubmissaoStatus;
	reviewedAt?: string;
};

export type SavedSubmissao = {
	id: string;
	markdown: string;
	imagemPath?: string;
};

export type SubmissaoRecord = {
	id: string;
	markdown: string;
	meta: SubmissaoMeta;
	nome: string;
	cidade: string;
	uf: string;
	autor?: string;
	resumo?: string;
	imagemUrl?: string;
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

async function tryDeleteDisk(id: string, imagemExt?: string) {
	try {
		await unlink(path.join(ROOT, `${id}.md`));
	} catch {
		// ignore
	}
	if (imagemExt) {
		try {
			await unlink(path.join(IMAGENS, `${id}.${imagemExt}`));
		} catch {
			// ignore
		}
	}
	try {
		const files = await readdir(IMAGENS);
		for (const file of files) {
			if (file.startsWith(`${id}.`)) {
				try {
					await unlink(path.join(IMAGENS, file));
				} catch {
					// ignore
				}
			}
		}
	} catch {
		// ignore
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

function normalizeMeta(raw: string | null, fallbackSavedAt?: string): SubmissaoMeta {
	if (!raw) {
		return {
			savedAt: fallbackSavedAt ?? new Date(0).toISOString(),
			status: 'aprovada',
		};
	}
	try {
		const parsed = JSON.parse(raw) as Partial<SubmissaoMeta>;
		const status = parsed.status;
		return {
			email: typeof parsed.email === 'string' ? parsed.email : undefined,
			savedAt:
				typeof parsed.savedAt === 'string'
					? parsed.savedAt
					: (fallbackSavedAt ?? new Date(0).toISOString()),
			status:
				status === 'pendente' || status === 'aprovada' || status === 'rejeitada'
					? status
					: 'aprovada',
			reviewedAt: typeof parsed.reviewedAt === 'string' ? parsed.reviewedAt : undefined,
		};
	} catch {
		return {
			savedAt: fallbackSavedAt ?? new Date(0).toISOString(),
			status: 'aprovada',
		};
	}
}

function summarizeMarkdown(id: string, markdown: string, meta: SubmissaoMeta): SubmissaoRecord {
	const parsed = parseMarkdown(markdown);
	const data = parsed.data;
	const imagem =
		typeof data.imagem === 'string' && data.imagem
			? data.imagem
			: undefined;

	return {
		id,
		markdown,
		meta,
		nome: typeof data.nome === 'string' ? data.nome : id,
		cidade: typeof data.cidade === 'string' ? data.cidade : '',
		uf: typeof data.uf === 'string' ? data.uf : '',
		autor: typeof data.autor === 'string' ? data.autor : undefined,
		resumo: typeof data.resumo === 'string' ? data.resumo : undefined,
		imagemUrl: imagem,
	};
}

export async function saveSubmissao(options: {
	id: string;
	markdown: string;
	email?: string;
	imagem?: { bytes: Uint8Array; meta: ImagemMeta } | null;
	origin?: string;
	status?: SubmissaoStatus;
}): Promise<SavedSubmissao> {
	const { id, markdown, email, imagem, origin } = options;
	let imagemPath: string | undefined;
	const status = options.status ?? 'pendente';

	await env.SUBMISSOES.put(`${MD_PREFIX}${id}`, markdown);
	await env.SUBMISSOES.put(
		`${RECORD_META_PREFIX}${id}`,
		JSON.stringify({
			email,
			savedAt: new Date().toISOString(),
			status,
		} satisfies SubmissaoMeta),
	);

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

export async function listSubmissaoMarkdown(options?: {
	statuses?: SubmissaoStatus[];
}): Promise<Array<{ id: string; markdown: string; meta: SubmissaoMeta }>> {
	const byId = new Map<string, { markdown: string; meta: SubmissaoMeta }>();
	const allowed = options?.statuses ? new Set(options.statuses) : null;

	try {
		const files = await readdir(ROOT);
		for (const file of files) {
			if (!file.endsWith('.md')) continue;
			const id = file.replace(/\.md$/, '');
			const markdown = await readFile(path.join(ROOT, file), 'utf8');
			const metaRaw = await env.SUBMISSOES.get(`${RECORD_META_PREFIX}${id}`);
			const meta = normalizeMeta(metaRaw, guessSavedAtFromId(id));
			byId.set(id, { markdown, meta });
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
			if (!value) continue;
			const metaRaw = await env.SUBMISSOES.get(`${RECORD_META_PREFIX}${id}`);
			const meta = normalizeMeta(metaRaw, guessSavedAtFromId(id));
			byId.set(id, { markdown: value, meta });
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	return [...byId.entries()]
		.map(([id, item]) => ({ id, markdown: item.markdown, meta: item.meta }))
		.filter((item) => (allowed ? allowed.has(item.meta.status) : true))
		.sort((a, b) => b.meta.savedAt.localeCompare(a.meta.savedAt));
}

export async function listSubmissoesAdmin(): Promise<SubmissaoRecord[]> {
	const items = await listSubmissaoMarkdown();
	return items.map((item) => summarizeMarkdown(item.id, item.markdown, item.meta));
}

export async function getSubmissaoRecord(id: string): Promise<SubmissaoRecord | null> {
	const safeId = sanitizeId(id);
	if (!safeId) return null;

	let markdown = await env.SUBMISSOES.get(`${MD_PREFIX}${safeId}`);
	if (!markdown) {
		try {
			markdown = await readFile(path.join(ROOT, `${safeId}.md`), 'utf8');
		} catch {
			return null;
		}
	}

	const metaRaw = await env.SUBMISSOES.get(`${RECORD_META_PREFIX}${safeId}`);
	const meta = normalizeMeta(metaRaw, guessSavedAtFromId(safeId));
	return summarizeMarkdown(safeId, markdown, meta);
}

export async function updateSubmissaoStatus(id: string, status: SubmissaoStatus) {
	const record = await getSubmissaoRecord(id);
	if (!record) return null;

	const next: SubmissaoMeta = {
		...record.meta,
		status,
		reviewedAt: new Date().toISOString(),
	};
	await env.SUBMISSOES.put(`${RECORD_META_PREFIX}${record.id}`, JSON.stringify(next));
	return { ...record, meta: next };
}

export async function deleteSubmissao(id: string) {
	const record = await getSubmissaoRecord(id);
	if (!record) return false;

	const safeId = record.id;
	await env.SUBMISSOES.delete(`${MD_PREFIX}${safeId}`);
	await env.SUBMISSOES.delete(`${RECORD_META_PREFIX}${safeId}`);
	await env.SUBMISSOES.delete(`${IMG_PREFIX}${safeId}`);
	await env.SUBMISSOES.delete(`${META_PREFIX}${safeId}`);

	const ext = record.imagemUrl?.split('.').pop();
	await tryDeleteDisk(safeId, ext);
	return true;
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

export function sanitizeId(id: string) {
	if (!/^[a-z0-9][a-z0-9-]{2,180}$/i.test(id)) return null;
	return id;
}

function guessSavedAtFromId(id: string) {
	const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(id);
	if (!match) return new Date(0).toISOString();
	const [, date, hh, mm, ss] = match;
	return `${date}T${hh}:${mm}:${ss}.000Z`;
}
