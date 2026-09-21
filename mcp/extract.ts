import type { BandaDraftPartial } from './schema';
import { isValidUf } from '../src/lib/location';
import { ufs } from '../src/lib/site';

const UF_BY_NAME = new Map(ufs.map((u) => [u.nome.toLowerCase(), u.sigla]));

function resumoFromArtigo(artigo: string) {
	const clean = artigo.replace(/\s+/g, ' ').trim();
	if (clean.length <= 180) return clean;
	return `${clean.slice(0, 177).trim()}…`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	const raw = fenced?.[1]?.trim() ?? text.trim();
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function normalizePartial(raw: Record<string, unknown>): BandaDraftPartial {
	const out: BandaDraftPartial = {};
	if (typeof raw.nome === 'string') out.nome = raw.nome.trim();
	if (typeof raw.cidade === 'string') out.cidade = raw.cidade.trim();
	if (typeof raw.uf === 'string') {
		const uf = raw.uf.trim().toUpperCase();
		out.uf = isValidUf(uf) ? uf : UF_BY_NAME.get(uf.toLowerCase()) ?? uf.slice(0, 2);
	}
	if (typeof raw.lat === 'number') out.lat = raw.lat;
	if (typeof raw.lng === 'number') out.lng = raw.lng;
	if (typeof raw.formacao === 'number') out.formacao = Math.trunc(raw.formacao);
	if (typeof raw.formacao === 'string' && /^\d{4}$/.test(raw.formacao)) {
		out.formacao = Number(raw.formacao);
	}
	if (typeof raw.encerramento === 'number') out.encerramento = Math.trunc(raw.encerramento);
	if (Array.isArray(raw.generos)) {
		out.generos = raw.generos.map(String).map((g) => g.trim()).filter(Boolean);
	}
	if (typeof raw.resumo === 'string') out.resumo = raw.resumo.trim();
	if (typeof raw.artigo === 'string') out.artigo = raw.artigo.trim();
	if (typeof raw.autor === 'string' && raw.autor.trim()) out.autor = raw.autor.trim();
	if (typeof raw.email === 'string') out.email = raw.email.trim();
	if (!out.resumo && out.artigo) out.resumo = resumoFromArtigo(out.artigo);
	if (!out.autor) out.autor = 'Agente MCP';
	return out;
}

/** Extração heurística quando o Workers AI não está disponível. */
export function extractHeuristic(text: string): BandaDraftPartial {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const joined = text.replace(/\s+/g, ' ').trim();
	const out: BandaDraftPartial = { autor: 'Agente MCP' };

	const nomeMatch =
		/(?:banda|grupo)\s+["“]?([A-Za-zÀ-ÿ0-9 .'\-]{2,50}?)(?=\s*,|\s+de\s+[A-ZÀ-Ÿ]|\s+em\s+[A-ZÀ-Ÿ]|\s+formad|\s+faz\b|[.!?])/i.exec(
			joined,
		) || /^([A-Za-zÀ-ÿ0-9 .'\-]{2,60})$/m.exec(lines[0] ?? '');
	if (nomeMatch) out.nome = nomeMatch[1]!.trim();
	else if (lines[0] && lines[0].length < 80) out.nome = lines[0];

	const lugar =
		/(?:de|em|na|no)\s+([A-Za-zÀ-ÿ .'\-]+?)\s*[,/(-]\s*([A-Z]{2})\b/i.exec(joined) ||
		/([A-Za-zÀ-ÿ .'\-]+)\s*[,/]\s*([A-Z]{2})\b/.exec(joined);
	if (lugar) {
		out.cidade = lugar[1]!.trim();
		const uf = lugar[2]!.toUpperCase();
		if (isValidUf(uf)) out.uf = uf;
	}

	for (const [nome, sigla] of UF_BY_NAME) {
		if (joined.toLowerCase().includes(nome) && !out.uf) out.uf = sigla;
	}

	const ano =
		/(?:forma(?:da|do|ção)?|fundad[oa]|desde|em)\s*(?:em\s*)?(19\d{2}|20\d{2})/i.exec(joined) ||
		/\b(19\d{2}|20\d{2})\b/.exec(joined);
	if (ano) out.formacao = Number(ano[1]);

	const generosKnown = [
		'rock',
		'metal',
		'punk',
		'mpb',
		'samba',
		'forró',
		'forro',
		'rap',
		'hip hop',
		'indie',
		'pop',
		'jazz',
		'blues',
		'psychedelic',
		'psicodélico',
		'hardcore',
		'folk',
	];
	out.generos = generosKnown.filter((g) => joined.toLowerCase().includes(g)).slice(0, 5);

	if (joined.length >= 80) {
		out.artigo = text.trim();
		out.resumo = resumoFromArtigo(text);
	}

	return out;
}

export type AiBinding = {
	run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
};

const EXTRACT_PROMPT = `Você extrai dados de bandas brasileiras para um arquivo histórico.
Responda APENAS com JSON válido (sem markdown) neste formato:
{
  "nome": string,
  "cidade": string,
  "uf": string (2 letras),
  "formacao": number (ano),
  "encerramento": number|null,
  "generos": string[],
  "resumo": string (até 180 chars),
  "artigo": string (texto corrido >= 80 chars),
  "autor": string
}
Se faltar um campo, omita-o. Não invente coordenadas.`;

export async function extractWithAi(
	ai: AiBinding,
	text: string,
	imageBytes?: Uint8Array,
): Promise<BandaDraftPartial | null> {
	try {
		if (imageBytes && imageBytes.length > 0) {
			const result = await ai.run('@cf/llava-hf/llava-1.5-7b-hf', {
				prompt: `${EXTRACT_PROMPT}\nDescreva e extraia dados da banda nesta imagem/texto auxiliar:\n${text || '(sem texto)'}`,
				image: [...imageBytes],
			});
			const response =
				typeof result === 'object' && result && 'response' in result
					? String((result as { response: unknown }).response)
					: String(result);
			const parsed = extractJsonObject(response) ?? extractJsonObject(await describeThenJson(ai, response));
			return parsed ? normalizePartial(parsed) : null;
		}

		const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{ role: 'system', content: EXTRACT_PROMPT },
				{ role: 'user', content: text },
			],
			max_tokens: 1200,
		});
		const response =
			typeof result === 'object' && result && 'response' in result
				? String((result as { response: unknown }).response)
				: String(result);
		const parsed = extractJsonObject(response);
		return parsed ? normalizePartial(parsed) : null;
	} catch (error) {
		console.error('Falha no Workers AI', error);
		return null;
	}
}

async function describeThenJson(ai: AiBinding, description: string) {
	const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
		messages: [
			{ role: 'system', content: EXTRACT_PROMPT },
			{ role: 'user', content: description },
		],
		max_tokens: 1200,
	});
	return typeof result === 'object' && result && 'response' in result
		? String((result as { response: unknown }).response)
		: String(result);
}

export async function extractBandaInput(options: {
	text: string;
	imageBytes?: Uint8Array;
	ai?: AiBinding | null;
}): Promise<BandaDraftPartial> {
	const { text, imageBytes, ai } = options;
	if (ai) {
		const fromAi = await extractWithAi(ai, text, imageBytes);
		if (fromAi && (fromAi.nome || fromAi.artigo || fromAi.cidade)) {
			return { ...extractHeuristic(text), ...fromAi };
		}
	}
	return extractHeuristic(text);
}
