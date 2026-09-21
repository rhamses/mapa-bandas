import type { BandaDraft } from './schema';
import { buildMarkdownFile } from '../src/lib/markdown';
import { slugifyNome } from '../src/lib/bandas';

export function draftToFrontmatter(draft: BandaDraft, id: string, imagemPaths: string[] = []) {
	const publicadoEm = new Date().toISOString().slice(0, 10);
	const capa = imagemPaths[0];
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
		...(capa ? { imagem: capa } : {}),
		...(imagemPaths.length ? { imagens: imagemPaths } : {}),
		...(draft.fontes?.length ? { fontes: draft.fontes } : {}),
	};
}

export function draftToMarkdown(draft: BandaDraft, id: string, imagemPaths: string[] = []) {
	return buildMarkdownFile(draftToFrontmatter(draft, id, imagemPaths), draft.artigo);
}

export function draftId(draft: BandaDraft) {
	const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
	const slug = slugifyNome(draft.nome) || 'banda';
	return `${stamp}-${slug}`;
}

export function formatPreview(draft: BandaDraft, imageCount = 0): string {
	const generos = draft.generos.length ? draft.generos.join(' · ') : '(sem gêneros)';
	const periodo = draft.encerramento
		? `${draft.formacao}–${draft.encerramento}`
		: `${draft.formacao}–hoje`;
	const fotos =
		imageCount <= 0
			? 'Nenhuma foto anexada'
			: imageCount === 1
				? '1 foto no relatório'
				: `${imageCount} fotos no relatório`;
	return [
		'## Prévia para aprovação',
		'',
		`**${draft.nome}** — ${draft.cidade}/${draft.uf}`,
		`Formação: ${periodo}`,
		`Gêneros: ${generos}`,
		`Autor: ${draft.autor}`,
		`Fotos: ${fotos}`,
		'',
		`> ${draft.resumo}`,
		'',
		'### Artigo',
		draft.artigo.slice(0, 600) + (draft.artigo.length > 600 ? '…' : ''),
		'',
		'Responda **sim** para publicar no acervo, ou envie correções / mais imagens.',
	].join('\n');
}
