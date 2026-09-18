export const prerender = false;

import { getSubmissaoImagem, sanitizeId } from '../../../../lib/submissoes';

/** /media/submissoes/:id/:file  — file = "0.jpg" (capa = posição 0) */
export async function GET({ params }: { params: { id?: string; file?: string } }) {
	const id = sanitizeId(params.id ?? '');
	const file = params.file ?? '';
	if (!id || !file || file.includes('/') || file.includes('..')) {
		return new Response('Não encontrado', { status: 404 });
	}

	const match = /^(\d+)\.([a-z0-9]+)$/i.exec(file);
	if (!match) {
		return new Response('Não encontrado', { status: 404 });
	}

	const posicao = Number.parseInt(match[1]!, 10);
	if (!Number.isFinite(posicao) || posicao < 0) {
		return new Response('Não encontrado', { status: 404 });
	}

	const imagem = await getSubmissaoImagem(id, posicao);
	if (!imagem) {
		return new Response('Não encontrado', { status: 404 });
	}

	return new Response(imagem.bytes, {
		status: 200,
		headers: {
			'Content-Type': imagem.meta.contentType,
			'Cache-Control': 'public, max-age=86400',
		},
	});
}
