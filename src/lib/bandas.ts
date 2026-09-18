import { parseMarkdown } from './markdown';
import { isSeedId } from './seed';
import { ensureSeedSubmissoes, listSubmissaoMarkdown } from './submissoes';

export type BandaData = {
	nome: string;
	cidade: string;
	uf: string;
	lat: number;
	lng: number;
	formacao: number;
	encerramento?: number;
	generos: string[];
	resumo: string;
	publicadoEm: Date;
	destaque: boolean;
	imagem?: string;
	fontes?: Array<{ titulo: string; url: string }>;
	autor?: string;
	/** False = ficha pública mostra “contribuição anônima”. Default true. */
	creditoPublico?: boolean;
};

export type Banda = {
	id: string;
	data: BandaData;
	body: string;
	html: string;
	origem: 'acervo' | 'submissao';
};

export type BandaMapa = {
	id: string;
	nome: string;
	cidade: string;
	uf: string;
	formacao: number;
	encerramento: number | null;
	generos: string;
	resumo: string;
	url: string;
	imagem?: string;
};

function coerceBandaData(raw: Record<string, unknown>): BandaData | null {
	if (typeof raw.nome !== 'string' || typeof raw.cidade !== 'string') return null;
	if (typeof raw.uf !== 'string' || raw.uf.length !== 2) return null;

	const formacao = Number(raw.formacao);
	const lat = Number(raw.lat);
	const lng = Number(raw.lng);
	if (!Number.isFinite(formacao) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	const generos = Array.isArray(raw.generos)
		? raw.generos.map(String).map((g) => g.trim()).filter(Boolean)
		: typeof raw.generos === 'string'
			? raw.generos.split(',').map((g) => g.trim()).filter(Boolean)
			: [];

	const publicadoEm = raw.publicadoEm ? new Date(String(raw.publicadoEm)) : new Date();
	if (Number.isNaN(publicadoEm.valueOf())) return null;

	const fontes = Array.isArray(raw.fontes)
		? raw.fontes
				.map((item) => {
					if (!item || typeof item !== 'object') return null;
					const fonte = item as Record<string, unknown>;
					if (typeof fonte.titulo !== 'string' || typeof fonte.url !== 'string') return null;
					return { titulo: fonte.titulo, url: fonte.url };
				})
				.filter((f): f is { titulo: string; url: string } => Boolean(f))
		: undefined;

	return {
		nome: raw.nome,
		cidade: raw.cidade,
		uf: raw.uf.toUpperCase(),
		lat,
		lng,
		formacao: Math.trunc(formacao),
		encerramento:
			raw.encerramento !== undefined && raw.encerramento !== null && raw.encerramento !== ''
				? Math.trunc(Number(raw.encerramento))
				: undefined,
		generos,
		resumo: typeof raw.resumo === 'string' ? raw.resumo : raw.nome,
		publicadoEm,
		destaque: Boolean(raw.destaque),
		imagem: typeof raw.imagem === 'string' && raw.imagem ? raw.imagem : undefined,
		fontes,
		autor: typeof raw.autor === 'string' ? raw.autor : undefined,
		creditoPublico: raw.creditoPublico === false ? false : true,
	};
}

function entryFromMarkdown(id: string, markdown: string, origem: Banda['origem']): Banda | null {
	const parsed = parseMarkdown(markdown);
	const data = coerceBandaData(parsed.data);
	if (!data) return null;
	return {
		id,
		data,
		body: parsed.body,
		html: parsed.html,
		origem,
	};
}

export function permalink(banda: Banda) {
	return `/bandas/${banda.id}`;
}

export function periodo(banda: Banda) {
	const { formacao, encerramento } = banda.data;
	return encerramento ? `${formacao}–${encerramento}` : `${formacao}–hoje`;
}

export function local(banda: Banda) {
	return `${banda.data.cidade}, ${banda.data.uf}`;
}

export function buscaBandas(bandas: Banda[], query: string) {
	const termo = query.trim().toLowerCase();
	if (!termo) return bandas;

	return bandas.filter((banda) => {
		const haystack = [
			banda.data.nome,
			banda.data.cidade,
			banda.data.uf,
			banda.data.resumo,
			...banda.data.generos,
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(termo);
	});
}

export function sortByRecentes(bandas: Banda[]) {
	return [...bandas].sort(
		(a, b) => b.data.publicadoEm.valueOf() - a.data.publicadoEm.valueOf(),
	);
}

export async function getBandas(): Promise<Banda[]> {
	const byId = new Map<string, Banda>();

	try {
		await ensureSeedSubmissoes();
		const submissoes = await listSubmissaoMarkdown({ statuses: ['aprovada'] });
		for (const item of submissoes) {
			const origem: Banda['origem'] = isSeedId(item.id) ? 'acervo' : 'submissao';
			const entry = entryFromMarkdown(item.id, item.markdown, origem);
			if (!entry) continue;
			byId.set(entry.id, entry);
		}
	} catch {
		// KV/FS indisponível
	}

	return sortByRecentes([...byId.values()]);
}

export async function getBanda(id: string): Promise<Banda | undefined> {
	const bandas = await getBandas();
	return bandas.find((banda) => banda.id === id);
}

export function toMapaFeatures(bandas: Banda[]) {
	return {
		type: 'FeatureCollection',
		features: bandas.map((banda) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [banda.data.lng, banda.data.lat],
			},
			properties: {
				id: banda.id,
				nome: banda.data.nome,
				cidade: banda.data.cidade,
				uf: banda.data.uf,
				formacao: banda.data.formacao,
				encerramento: banda.data.encerramento ?? null,
				generos: banda.data.generos.join(' · '),
				resumo: banda.data.resumo,
				url: permalink(banda),
				imagem: banda.data.imagem,
			} satisfies BandaMapa,
		})),
	};
}

export function slugifyNome(nome: string) {
	return nome
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}
