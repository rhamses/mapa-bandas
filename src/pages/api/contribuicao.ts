export const prerender = false;

import { buildMarkdownFile } from '../../lib/markdown';
import { slugifyNome } from '../../lib/bandas';
import { isValidBrazilCoords, isValidUf } from '../../lib/location';
import {
	contentTypeForExt,
	extForContentType,
	saveSubmissao,
	type ImagemMeta,
} from '../../lib/submissoes';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function field(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function html(message: string, ok: boolean) {
	const classes = ok
		? 'rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest'
		: 'rounded-2xl border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay';
	return new Response(`<p class="${classes}">${message}</p>`, {
		status: ok ? 200 : 400,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

function successTrigger(message: string) {
	return new Response('', {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'HX-Trigger': JSON.stringify({ contribuicaoSucesso: { message } }),
		},
	});
}

function resumoFromArtigo(artigo: string) {
	const clean = artigo.replace(/\s+/g, ' ').trim();
	if (clean.length <= 180) return clean;
	return `${clean.slice(0, 177).trim()}…`;
}

function parseGeneros(value: string) {
	return value
		.split(',')
		.map((g) => g.trim())
		.filter(Boolean);
}

function parseFontes(values: string[]) {
	return values
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				const url = new URL(line);
				return { titulo: url.hostname.replace(/^www\./, ''), url: url.href };
			} catch {
				return { titulo: line, url: '#' };
			}
		});
}

async function readImagem(form: FormData): Promise<
	{ ok: true; value: { bytes: Uint8Array; meta: ImagemMeta } | null } | { ok: false; error: string }
> {
	const file = form.get('imagem');
	if (!file || typeof file === 'string') return { ok: true, value: null };
	if (!(file instanceof File)) return { ok: true, value: null };
	if (!file.size) return { ok: true, value: null };

	if (file.size > MAX_IMAGE_BYTES) {
		return { ok: false, error: 'A imagem pode ter no máximo 5 MB.' };
	}

	const type = file.type || contentTypeForExt(file.name.split('.').pop() ?? '');
	if (!ALLOWED_IMAGE_TYPES.has(type)) {
		return { ok: false, error: 'Envie uma imagem JPG, PNG, WebP ou GIF.' };
	}

	const ext = extForContentType(type);
	if (!ext) return { ok: false, error: 'Formato de imagem não suportado.' };

	const bytes = new Uint8Array(await file.arrayBuffer());
	return {
		ok: true,
		value: {
			bytes,
			meta: {
				contentType: type,
				filename: file.name || `imagem.${ext}`,
				ext,
			},
		},
	};
}

export async function POST({ request }: { request: Request }) {
	const form = await request.formData();

	if (field(form, 'website')) {
		return successTrigger('Recebemos sua contribuição. Obrigado por escrever o arquivo.');
	}

	const nome = field(form, 'nome');
	const cidade = field(form, 'cidade');
	const uf = field(form, 'uf').toUpperCase();
	const mapboxId = field(form, 'mapbox_id');
	const lat = Number(field(form, 'lat'));
	const lng = Number(field(form, 'lng'));
	const formacaoRaw = field(form, 'formacao');
	const encerramentoRaw = field(form, 'encerramento');
	const generosRaw = field(form, 'generos');
	const artigo = field(form, 'artigo');
	const fontesRaw = form
		.getAll('fonte')
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter(Boolean);
	const autor = field(form, 'autor');
	const email = field(form, 'email');
	const enviadoEm = new Date().toISOString();
	const anoAtual = new Date().getFullYear();

	if (nome.length < 2) return html('Diga o nome da banda.', false);
	if (!mapboxId || cidade.length < 2 || !isValidUf(uf)) {
		return html('Escolha a localização na busca de lugares.', false);
	}
	if (!isValidBrazilCoords(lat, lng)) {
		return html('Escolha a localização na busca de lugares.', false);
	}
	if (artigo.length < 80) {
		return html('O artigo precisa ter pelo menos 80 caracteres.', false);
	}
	if (autor.length < 2) return html('Assine a contribuição.', false);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return html('Informe um e-mail válido.', false);
	}

	const formacao = formacaoRaw ? Number(formacaoRaw) : anoAtual;
	if (!Number.isFinite(formacao) || formacao < 1900 || formacao > anoAtual) {
		return html('Informe um ano de formação válido.', false);
	}
	const formacaoAno = Math.trunc(formacao);

	let encerramento: number | undefined;
	if (encerramentoRaw) {
		const fim = Number(encerramentoRaw);
		if (!Number.isFinite(fim) || fim < 1900 || fim > anoAtual) {
			return html('Informe um ano de encerramento válido.', false);
		}
		encerramento = Math.trunc(fim);
		if (encerramento < formacaoAno) {
			return html('O encerramento não pode ser anterior à formação.', false);
		}
	}

	const imagemResult = await readImagem(form);
	if (!imagemResult.ok) return html(imagemResult.error, false);

	const slug = slugifyNome(nome) || 'banda';
	const id = `${enviadoEm.slice(0, 19).replace(/[:T]/g, '-')}-${slug}`;
	const generos = parseGeneros(generosRaw);
	const fontes = parseFontes(fontesRaw);
	const imagemPath = imagemResult.value
		? `/media/submissoes/${id}.${imagemResult.value.meta.ext}`
		: undefined;

	const frontmatter: Record<string, unknown> = {
		nome,
		cidade,
		uf,
		lat,
		lng,
		formacao: formacaoAno,
		...(encerramento !== undefined ? { encerramento } : {}),
		generos,
		resumo: resumoFromArtigo(artigo),
		publicadoEm: enviadoEm.slice(0, 10),
		destaque: false,
		autor,
		...(imagemPath ? { imagem: imagemPath } : {}),
		...(fontes.length ? { fontes } : {}),
	};

	const markdown = buildMarkdownFile(frontmatter, artigo);

	try {
		await saveSubmissao({
			id,
			markdown,
			email,
			imagem: imagemResult.value,
			origin: new URL(request.url).origin,
		});
	} catch (error) {
		console.error('Falha ao gravar contribuição', error);
		return html('Não foi possível salvar a contribuição agora. Tente de novo em instantes.', false);
	}

	return successTrigger(
		'Recebemos sua contribuição. Ela entrou em revisão e, depois de aprovada, aparece no arquivo.',
	);
}
