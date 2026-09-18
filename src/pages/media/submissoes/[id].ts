export const prerender = false;

import { getSubmissaoImagem } from '../../../lib/submissoes';

export async function GET({ params }: { params: { id?: string } }) {
	const raw = params.id ?? '';
	const id = raw.replace(/\.[a-z0-9]+$/i, '');
	if (!id || id.includes('/') || id.includes('..')) {
		return new Response('Não encontrado', { status: 404 });
	}

	const imagem = await getSubmissaoImagem(id);
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
