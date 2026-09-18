import { env } from 'cloudflare:workers';
import { buildMarkdownFile, parseMarkdown } from './markdown';
import { isSeedId, listSeedMarkdown } from './seed';

const R2_PREFIX = 'mapa-bandas/submissoes';

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
	/** Quando false, a ficha pública mostra “contribuição anônima”. */
	creditoPublico?: boolean;
};

export type ImagemRecord = {
	posicao: number;
	url: string;
	contentType: string;
	filename: string;
	ext: string;
	r2Key: string;
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
	/** Capa (primeira foto). */
	imagemUrl?: string;
	imagens: ImagemRecord[];
	creditoPublico: boolean;
};

type SubmissaoRow = {
	id: string;
	markdown: string;
	email: string | null;
	status: string;
	saved_at: string;
	reviewed_at: string | null;
	credito_publico: number;
};

type ImagemRow = {
	posicao: number;
	r2_key: string;
	content_type: string;
	filename: string;
	ext: string;
};

function mediaUrl(id: string, posicao: number, ext: string) {
	return `/media/submissoes/${id}/${posicao}.${ext}`;
}

function r2Key(id: string, posicao: number, ext: string) {
	return `${R2_PREFIX}/${id}/${posicao}.${ext}`;
}

function rowToMeta(row: SubmissaoRow): SubmissaoMeta {
	const status = row.status;
	return {
		email: row.email ?? undefined,
		savedAt: row.saved_at,
		status:
			status === 'pendente' || status === 'aprovada' || status === 'rejeitada'
				? status
				: 'aprovada',
		reviewedAt: row.reviewed_at ?? undefined,
		creditoPublico: row.credito_publico !== 0,
	};
}

async function listImagens(submissaoId: string): Promise<ImagemRecord[]> {
	const { results } = await env.DB.prepare(
		`SELECT posicao, r2_key, content_type, filename, ext
     FROM mb_imagens WHERE submissao_id = ? ORDER BY posicao ASC`,
	)
		.bind(submissaoId)
		.all<ImagemRow>();

	return (results ?? []).map((row) => ({
		posicao: row.posicao,
		url: mediaUrl(submissaoId, row.posicao, row.ext),
		contentType: row.content_type,
		filename: row.filename,
		ext: row.ext,
		r2Key: row.r2_key,
	}));
}

function summarizeMarkdown(
	id: string,
	markdown: string,
	meta: SubmissaoMeta,
	imagens: ImagemRecord[],
): SubmissaoRecord {
	const parsed = parseMarkdown(markdown);
	const data = parsed.data;
	const capa =
		imagens[0]?.url ??
		(typeof data.imagem === 'string' && data.imagem ? data.imagem : undefined);
	const fromFrontmatter =
		data.creditoPublico === false ? false : data.creditoPublico === true ? true : undefined;

	return {
		id,
		markdown,
		meta,
		nome: typeof data.nome === 'string' ? data.nome : id,
		cidade: typeof data.cidade === 'string' ? data.cidade : '',
		uf: typeof data.uf === 'string' ? data.uf : '',
		autor: typeof data.autor === 'string' ? data.autor : undefined,
		resumo: typeof data.resumo === 'string' ? data.resumo : undefined,
		imagemUrl: capa,
		imagens,
		creditoPublico: fromFrontmatter ?? meta.creditoPublico !== false,
	};
}

export async function saveSubmissao(options: {
	id: string;
	markdown: string;
	email?: string;
	imagens?: Array<{ bytes: Uint8Array; meta: ImagemMeta }>;
	/** @deprecated use imagens */
	imagem?: { bytes: Uint8Array; meta: ImagemMeta } | null;
	status?: SubmissaoStatus;
	savedAt?: string;
}): Promise<SavedSubmissao> {
	const { id, markdown, email } = options;
	const status = options.status ?? 'pendente';
	const savedAt = options.savedAt ?? new Date().toISOString();
	const imagens =
		options.imagens ??
		(options.imagem ? [options.imagem] : []);

	await env.DB.prepare(
		`INSERT INTO mb_submissoes (id, markdown, email, status, saved_at, reviewed_at, credito_publico)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       markdown = excluded.markdown,
       email = excluded.email,
       status = excluded.status,
       saved_at = excluded.saved_at,
       reviewed_at = excluded.reviewed_at,
       credito_publico = excluded.credito_publico`,
	)
		.bind(
			id,
			markdown,
			email ?? null,
			status,
			savedAt,
			status === 'aprovada' || status === 'rejeitada' ? savedAt : null,
		)
		.run();

	let imagemPath: string | undefined;

	for (let i = 0; i < imagens.length; i++) {
		const item = imagens[i]!;
		const key = r2Key(id, i, item.meta.ext);
		await env.MEDIA.put(key, item.bytes, {
			httpMetadata: { contentType: item.meta.contentType },
			customMetadata: { filename: item.meta.filename },
		});
		await env.DB.prepare(
			`INSERT INTO mb_imagens (submissao_id, posicao, r2_key, content_type, filename, ext)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(submissao_id, posicao) DO UPDATE SET
         r2_key = excluded.r2_key,
         content_type = excluded.content_type,
         filename = excluded.filename,
         ext = excluded.ext`,
		)
			.bind(id, i, key, item.meta.contentType, item.meta.filename, item.meta.ext)
			.run();
		if (i === 0) imagemPath = mediaUrl(id, 0, item.meta.ext);
	}

	return { id, markdown, imagemPath };
}

export async function listSubmissaoMarkdown(options?: {
	statuses?: SubmissaoStatus[];
}): Promise<Array<{ id: string; markdown: string; meta: SubmissaoMeta }>> {
	const allowed = options?.statuses;
	let sql = `SELECT id, markdown, email, status, saved_at, reviewed_at, credito_publico
    FROM mb_submissoes`;
	const binds: string[] = [];

	if (allowed?.length) {
		sql += ` WHERE status IN (${allowed.map(() => '?').join(',')})`;
		binds.push(...allowed);
	}
	sql += ` ORDER BY saved_at DESC, id DESC`;

	const stmt = env.DB.prepare(sql);
	const { results } = binds.length
		? await stmt.bind(...binds).all<SubmissaoRow>()
		: await stmt.all<SubmissaoRow>();

	return (results ?? []).map((row) => ({
		id: row.id,
		markdown: row.markdown,
		meta: rowToMeta(row),
	}));
}

function savedAtFromMarkdown(markdown: string, fallbackId: string) {
	const parsed = parseMarkdown(markdown);
	const raw = parsed.data.publicadoEm;
	if (raw !== undefined && raw !== null && raw !== '') {
		const date = new Date(String(raw));
		if (!Number.isNaN(date.valueOf())) return date.toISOString();
	}
	return guessSavedAtFromId(fallbackId);
}

async function metaGet(key: string) {
	const row = await env.DB.prepare(`SELECT value FROM mb_meta WHERE key = ?`)
		.bind(key)
		.first<{ value: string }>();
	return row?.value ?? null;
}

async function metaPut(key: string, value: string) {
	await env.DB.prepare(
		`INSERT INTO mb_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
	)
		.bind(key, value)
		.run();
}

/** Importa o acervo seed como submissões aprovadas (uma vez por id). */
export async function ensureSeedSubmissoes() {
	for (const { id, markdown } of listSeedMarkdown()) {
		const doneKey = `seed-done:${id}`;
		const alreadyDone = await metaGet(doneKey);
		const existing = await env.DB.prepare(`SELECT id FROM mb_submissoes WHERE id = ?`)
			.bind(id)
			.first();
		const seedSavedAt = savedAtFromMarkdown(markdown, id);

		if (!existing) {
			await saveSubmissao({
				id,
				markdown,
				email: 'seed@mapa-bandas.local',
				status: 'aprovada',
				savedAt: seedSavedAt,
			});
		} else if (!alreadyDone) {
			await env.DB.prepare(
				`UPDATE mb_submissoes SET saved_at = ?, email = COALESCE(email, ?) WHERE id = ?`,
			)
				.bind(seedSavedAt, 'seed@mapa-bandas.local', id)
				.run();
		}

		if (!alreadyDone) await metaPut(doneKey, '1');
	}

	if (!(await metaGet('seed-dates:v1'))) {
		for (const { id, markdown } of listSeedMarkdown()) {
			const seedSavedAt = savedAtFromMarkdown(markdown, id);
			await env.DB.prepare(`UPDATE mb_submissoes SET saved_at = ? WHERE id = ?`)
				.bind(seedSavedAt, id)
				.run();
		}
		await metaPut('seed-dates:v1', '1');
	}
}

export async function listSubmissoesAdmin(): Promise<SubmissaoRecord[]> {
	await ensureSeedSubmissoes();
	const items = await listSubmissaoMarkdown();
	const out: SubmissaoRecord[] = [];
	for (const item of items) {
		const imagens = await listImagens(item.id);
		out.push(summarizeMarkdown(item.id, item.markdown, item.meta, imagens));
	}
	return out;
}

export async function getSubmissaoRecord(id: string): Promise<SubmissaoRecord | null> {
	const safeId = sanitizeId(id);
	if (!safeId) return null;

	const row = await env.DB.prepare(
		`SELECT id, markdown, email, status, saved_at, reviewed_at, credito_publico
     FROM mb_submissoes WHERE id = ?`,
	)
		.bind(safeId)
		.first<SubmissaoRow>();
	if (!row) return null;

	const imagens = await listImagens(safeId);
	return summarizeMarkdown(safeId, row.markdown, rowToMeta(row), imagens);
}

export async function updateSubmissaoStatus(id: string, status: SubmissaoStatus) {
	const record = await getSubmissaoRecord(id);
	if (!record) return null;

	const reviewedAt = new Date().toISOString();
	await env.DB.prepare(
		`UPDATE mb_submissoes SET status = ?, reviewed_at = ? WHERE id = ?`,
	)
		.bind(status, reviewedAt, record.id)
		.run();

	return {
		...record,
		meta: { ...record.meta, status, reviewedAt, creditoPublico: record.meta.creditoPublico !== false },
	};
}

export async function updateSubmissaoCredito(id: string, creditoPublico: boolean) {
	const record = await getSubmissaoRecord(id);
	if (!record) return null;

	const parsed = parseMarkdown(record.markdown);
	const nextMarkdown = buildMarkdownFile(
		{
			...parsed.data,
			creditoPublico,
		},
		parsed.body,
	);

	await env.DB.prepare(
		`UPDATE mb_submissoes SET markdown = ?, credito_publico = ? WHERE id = ?`,
	)
		.bind(nextMarkdown, creditoPublico ? 1 : 0, record.id)
		.run();

	return summarizeMarkdown(
		record.id,
		nextMarkdown,
		{ ...record.meta, creditoPublico },
		record.imagens,
	);
}

export async function deleteSubmissao(id: string) {
	const record = await getSubmissaoRecord(id);
	if (!record) return false;

	const safeId = record.id;
	for (const img of record.imagens) {
		try {
			await env.MEDIA.delete(img.r2Key);
		} catch {
			// ignore
		}
	}

	await env.DB.prepare(`DELETE FROM mb_imagens WHERE submissao_id = ?`).bind(safeId).run();
	await env.DB.prepare(`DELETE FROM mb_submissoes WHERE id = ?`).bind(safeId).run();

	if (isSeedId(safeId)) {
		await metaPut(`seed-done:${safeId}`, '1');
	}
	return true;
}

export async function getSubmissaoImagem(
	id: string,
	posicao = 0,
): Promise<{ bytes: Uint8Array; meta: ImagemMeta } | null> {
	const safeId = sanitizeId(id);
	if (!safeId) return null;

	const row = await env.DB.prepare(
		`SELECT r2_key, content_type, filename, ext FROM mb_imagens
     WHERE submissao_id = ? AND posicao = ?`,
	)
		.bind(safeId, posicao)
		.first<ImagemRow>();

	if (!row) return null;

	const obj = await env.MEDIA.get(row.r2_key);
	if (!obj) return null;

	const buf = await obj.arrayBuffer();
	return {
		bytes: new Uint8Array(buf),
		meta: {
			contentType: row.content_type,
			filename: row.filename,
			ext: row.ext,
		},
	};
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
