export const prerender = false;

import { sameOrigin } from '../../../../lib/admin-auth';
import {
	deleteSubmissao,
	sanitizeId,
	updateSubmissaoStatus,
	type SubmissaoStatus,
} from '../../../../lib/submissoes';

function html(message: string, ok: boolean, refresh = false) {
	const classes = ok
		? 'rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest'
		: 'rounded-2xl border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay';
	const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
	if (ok && refresh) headers['HX-Refresh'] = 'true';
	return new Response(`<p class="${classes}">${message}</p>`, {
		status: ok ? 200 : 400,
		headers,
	});
}

export async function POST({
	params,
	request,
}: {
	params: { id?: string };
	request: Request;
}) {
	if (!sameOrigin(request)) {
		return html('Pedido não autorizado.', false);
	}

	const id = sanitizeId(params.id ?? '');
	if (!id) return html('Contribuição inválida.', false);

	const form = await request.formData();
	const action = String(form.get('action') ?? '').trim();

	if (action === 'aprovar' || action === 'rejeitar') {
		const status: SubmissaoStatus = action === 'aprovar' ? 'aprovada' : 'rejeitada';
		const updated = await updateSubmissaoStatus(id, status);
		if (!updated) return html('Contribuição não encontrada.', false);
		return html(
			status === 'aprovada'
				? 'Contribuição aprovada e publicada no arquivo.'
				: 'Contribuição rejeitada.',
			true,
			true,
		);
	}

	if (action === 'excluir') {
		const deleted = await deleteSubmissao(id);
		if (!deleted) return html('Contribuição não encontrada.', false);
		return html('Contribuição excluída.', true, true);
	}

	return html('Ação desconhecida.', false);
}
