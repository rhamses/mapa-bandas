export const prerender = false;

import { env } from 'cloudflare:workers';
import { PUBLIC_MAPBOX_TOKEN } from 'astro:env/client';
import { callMcpTool } from '../../../../mcp/index';
import { getPublicMapboxToken } from '../../../lib/mapbox-token';
import {
	getOrCreateSession,
	isConfirmation,
	saveSession,
	sessionCookie,
	type AgentMessage,
} from '../../../lib/agent-session';
import { missingFields } from '../../../../mcp/schema';
import { enrichCoords } from '../../../../mcp/geocode';

type ChatBody = {
	message?: string;
	image_base64?: string;
	image_mime?: string;
};

function json(data: unknown, status = 200, cookie?: string) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
	if (cookie) headers['Set-Cookie'] = cookie;
	return new Response(JSON.stringify(data), { status, headers });
}

function aiBinding() {
	return (env as Env & { AI?: { run: (m: string, i: Record<string, unknown>) => Promise<unknown> } }).AI ?? null;
}

function push(session: { messages: AgentMessage[] }, role: AgentMessage['role'], content: string) {
	session.messages.push({ role, content, at: new Date().toISOString() });
	if (session.messages.length > 40) {
		session.messages = session.messages.slice(-40);
	}
}

export async function POST({ request }: { request: Request }) {
	let body: ChatBody;
	try {
		body = (await request.json()) as ChatBody;
	} catch {
		return json({ error: 'JSON inválido' }, 400);
	}

	const message = (body.message ?? '').trim();
	const hasImage = Boolean(body.image_base64);
	if (!message && !hasImage) {
		return json({ error: 'Envie uma mensagem ou imagem.' }, 400);
	}

	const session = await getOrCreateSession(request);
	const cookie = sessionCookie(session.id);
	const ctx = {
		mapboxToken: getPublicMapboxToken(PUBLIC_MAPBOX_TOKEN),
		ai: aiBinding(),
	};

	push(session, 'user', message || '(imagem enviada)');

	// Confirmação de publicação
	if (message && isConfirmation(message) && session.pendingDraft) {
		const result = await callMcpTool(
			'aprovar_banda',
			{
				draft: session.pendingDraft,
				confirmacao: message,
				imagem_base64: session.pendingImageBase64,
				imagem_mime: session.pendingImageMime,
			},
			ctx,
		);

		const reply = result.ok
			? `${result.message}\n\nAbrir ficha: ${result.url}`
			: result.message;
		push(session, 'assistant', reply);
		if (result.ok) {
			session.pendingDraft = null;
			session.pendingImageBase64 = undefined;
			session.pendingImageMime = undefined;
		}
		await saveSession(session);
		return json(
			{
				reply,
				preview: null,
				pending: false,
				savedId: result.savedId,
				url: result.url,
				messages: session.messages,
			},
			200,
			cookie,
		);
	}

	// Merge de correções curtas no rascunho pendente
	if (session.pendingDraft && message && !hasImage && message.length < 400 && !isConfirmation(message)) {
		const merged = await enrichCoords(
			{ ...session.pendingDraft, ...parseCorrecoes(message, session.pendingDraft) },
			ctx.mapboxToken,
		);
		session.pendingDraft = merged;
		const missing = missingFields(merged);
		if (missing.length === 0) {
			const { formatPreview } = await import('../../../../mcp/format');
			const { bandaDraftSchema } = await import('../../../../mcp/schema');
			const full = bandaDraftSchema.safeParse(merged);
			if (full.success) {
				const preview = formatPreview(full.data);
				session.pendingDraft = full.data;
				push(session, 'assistant', preview);
				await saveSession(session);
				return json(
					{ reply: preview, preview, pending: true, messages: session.messages },
					200,
					cookie,
				);
			}
		}
		const ask = `Atualizei o rascunho. Ainda faltam: ${missing.join(', ') || 'nada'}.`;
		push(session, 'assistant', ask);
		await saveSession(session);
		return json({ reply: ask, pending: true, draft: merged, messages: session.messages }, 200, cookie);
	}

	const result = await callMcpTool(
		'extrair_banda',
		{
			texto: message,
			imagem_base64: body.image_base64,
			imagem_mime: body.image_mime,
		},
		ctx,
	);

	session.pendingDraft = result.draft ?? null;
	if (body.image_base64) {
		session.pendingImageBase64 = body.image_base64;
		session.pendingImageMime = body.image_mime || 'image/jpeg';
	}

	const reply = result.preview || result.message;
	push(session, 'assistant', reply);
	await saveSession(session);

	return json(
		{
			reply,
			preview: result.preview,
			pending: Boolean(result.draft && (!result.missing || result.missing.length === 0)),
			missing: result.missing,
			draft: result.draft,
			messages: session.messages,
		},
		200,
		cookie,
	);
}

function parseCorrecoes(text: string, current: Record<string, unknown>) {
	const out: Record<string, unknown> = {};
	const cidade = /cidade\s*[:=]\s*(.+)$/im.exec(text);
	const uf = /\buf\s*[:=]\s*([A-Za-z]{2})\b/im.exec(text);
	const nome = /nome\s*[:=]\s*(.+)$/im.exec(text);
	const formacao = /forma(?:cao|ção)?\s*[:=]\s*(\d{4})/im.exec(text);
	const autor = /autor\s*[:=]\s*(.+)$/im.exec(text);
	const email = /e-?mail\s*[:=]\s*(\S+)/im.exec(text);
	if (cidade) out.cidade = cidade[1]!.trim();
	if (uf) out.uf = uf[1]!.toUpperCase();
	if (nome) out.nome = nome[1]!.trim();
	if (formacao) out.formacao = Number(formacao[1]);
	if (autor) out.autor = autor[1]!.trim();
	if (email) out.email = email[1]!.trim();

	// "artigo: ..." long form
	const artigo = /artigo\s*[:=]\s*([\s\S]+)/im.exec(text);
	if (artigo && artigo[1]!.trim().length >= 80) out.artigo = artigo[1]!.trim();

	// If user just pasted a long paragraph while pending, treat as artigo
	if (!Object.keys(out).length && text.length >= 80) {
		out.artigo = text;
		if (!current.resumo) out.resumo = text.slice(0, 177).trim() + '…';
	}

	return out;
}
