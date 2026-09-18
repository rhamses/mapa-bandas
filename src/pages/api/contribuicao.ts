export const prerender = false;

import { env } from 'cloudflare:workers';
import { ufs } from '../../lib/site';

const ufValidas = new Set(ufs.map((uf) => uf.sigla));

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

export async function POST({ request }: { request: Request }) {
	const form = await request.formData();

	if (field(form, 'website')) {
		return html('Recebemos sua contribuição. Obrigado por escrever o arquivo.', true);
	}

	const payload = {
		nome: field(form, 'nome'),
		cidade: field(form, 'cidade'),
		uf: field(form, 'uf').toUpperCase(),
		formacao: field(form, 'formacao'),
		generos: field(form, 'generos'),
		artigo: field(form, 'artigo'),
		fontes: field(form, 'fontes'),
		autor: field(form, 'autor'),
		email: field(form, 'email'),
		enviadoEm: new Date().toISOString(),
	};

	if (payload.nome.length < 2) return html('Diga o nome da banda.', false);
	if (payload.cidade.length < 2) return html('Informe a cidade.', false);
	if (!ufValidas.has(payload.uf as (typeof ufs)[number]['sigla'])) {
		return html('Escolha um estado válido.', false);
	}
	if (payload.artigo.length < 80) {
		return html('O artigo precisa ter pelo menos 80 caracteres.', false);
	}
	if (payload.autor.length < 2) return html('Assine a contribuição.', false);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
		return html('Informe um e-mail válido.', false);
	}

	const slug = payload.nome
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	const key = `${payload.enviadoEm}-${slug || 'banda'}`;
	await env.SUBMISSOES.put(key, JSON.stringify(payload));

	return html(
		'Recebemos sua contribuição. Ela entra em revisão e, se aprovada, aparece no arquivo e no mapa.',
		true,
	);
}
