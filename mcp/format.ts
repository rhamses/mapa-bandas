import type { BandaDraft } from './schema';
import { buildMarkdownFile } from '../src/lib/markdown';
import { slugifyNome } from '../src/lib/bandas';

export function draftToFrontmatter(draft: BandaDraft, id: string, imagemPath?: string) {
	const publicadoEm = new Date().toISOString().slice(0, 10);
	return {
		nome: draft.nome,
		cidade: draft.cidade,
		uf: draft.uf.toUpperCase(),
		lat: draft.lat,
		lng: draft.lng,
		formacao: draft.formacao,
		...(draft.encerramento !== undefined ? { encerramento: draft.encerramento } : {}),
		generos: draft.generos,
		resumo: draft.resumo,
		publicadoEm,
		destaque: false,
		autor: draft.autor,
		creditoPublico: draft.creditoPublico !== false,
		...(imagemPath ? { imagem: imagemPath } : {}),
		...(draft.fontes?.length ? { fontes: draft.fontes } : {}),
	};
}

export function draftToMarkdown(draft: BandaDraft, id: string, imagemPath?: string) {
	return buildMarkdownFile(draftToFrontmatter(draft, id, imagemPath), draft.artigo);
}

export function draftId(draft: BandaDraft) {
	const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
	const slug = slugifyNome(draft.nome) || 'banda';
	return `${stamp}-${slug}`;
}

export function formatPreview(draft: BandaDraft): string {
	const generos = draft.generos.length ? draft.generos.join(' · ') : '(sem gêneros)';
	const periodo = draft.encerramento
		? `${draft.formacao}–${draft.encerramento}`
		: `${draft.formacao}–hoje`;
	return [
		'## Prévia para aprovação',
		'',
		`**${draft.nome}** — ${draft.cidade}/${draft.uf}`,
		`Formação: ${periodo}`,
		`Gêneros: ${generos}`,
		`Autor: ${draft.autor}`,
		'',
		`> ${draft.resumo}`,
		'',
		'### Artigo',
		draft.artigo.slice(0, 600) + (draft.artigo.length > 600 ? '…' : ''),
		'',
		'Responda **sim** para publicar no acervo, ou envie correções em texto.',
	].join('\n');
}
