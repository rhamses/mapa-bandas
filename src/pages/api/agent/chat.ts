export const prerender = false;

import { env } from 'cloudflare:workers';
import { PUBLIC_MAPBOX_TOKEN } from 'astro:env/client';
import { callMcpTool, MAX_AGENT_IMAGES } from '../../../../mcp/index';
import { getPublicMapboxToken } from '../../../lib/mapbox-token';
import {
	clearPendingMedia,
	getOrCreateSession,
	isConfirmation,
	saveSession,
	sessionCookie,
	type AgentMessage,
	type PendingImage,
} from '../../../lib/agent-session';
import { missingFields } from '../../../../mcp/schema';
import { enrichCoords } from '../../../../mcp/geocode';

type ChatImage = {
	base64?: string;
	mime?: string;
	filename?: string;
	name?: string;
};

type ChatBody = {
	message?: string;
	images?: ChatImage[];
	/** compat */
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

function normalizeIncomingImages(body: ChatBody): PendingImage[] {
	const out: PendingImage[] = [];
	if (Array.isArray(body.images)) {
		for (const item of body.images) {
			if (!item?.base64) continue;
			out.push({
				base64: item.base64.replace(/^data:[^;]+;base64,/, ''),
				mime: item.mime || 'image/jpeg',
				filename: item.filename || item.name,
			});
			if (out.length >= MAX_AGENT_IMAGES) break;
		}
	}
	if (out.length === 0 && body.image_base64) {
		out.push({
			base64: body.image_base64.replace(/^data:[^;]+;base64,/, ''),
			mime: body.image_mime || 'image/jpeg',
		});
	}
	return out;
}

function mergeImages(existing: PendingImage[], incoming: PendingImage[]) {
	const merged = [...existing];
	for (const img of incoming) {
		if (merged.length >= MAX_AGENT_IMAGES) break;
		merged.push(img);
	}
	return merged;
}

export async function POST({ request }: { request: Request }) {
	let body: ChatBody;
	try {
		body = (await request.json()) as ChatBody;
	} catch {
		return json({ error: 'JSON inválido' }, 400);
	}

	const message = (body.message ?? '').trim();
	const incomingImages = normalizeIncomingImages(body);
	if (!message && incomingImages.length === 0) {
		return json({ error: 'Envie uma mensagem ou uma ou mais imagens.' }, 400);
	}

	const session = await getOrCreateSession(request);
	const cookie = sessionCookie(session.id);
	const ctx = {
		mapboxToken: getPublicMapboxToken(PUBLIC_MAPBOX_TOKEN),
		ai: aiBinding(),
	};

	const userLabel =
		message ||
		(incomingImages.length === 1
			? '(1 imagem enviada)'
			: `(${incomingImages.length} imagens enviadas)`);
	push(session, 'user', userLabel);

	// Confirmação de publicação
	if (message && isConfirmation(message) && session.pendingDraft) {
		if (incomingImages.length) {
			session.pendingImages = mergeImages(session.pendingImages, incomingImages);
		}
		const result = await callMcpTool(
			'aprovar_banda',
			{
				draft: session.pendingDraft,
				confirmacao: message,
				imagens: session.pendingImages.map((img) => ({
					base64: img.base64,
					mime: img.mime,
					filename: img.filename,
				})),
			},
			ctx,
		);

		const reply = result.ok
			? `${result.message}\n\nAbrir ficha: ${result.url}`
			: result.message;
		push(session, 'assistant', reply);
		if (result.ok) clearPendingMedia(session);
		await saveSession(session);
		return json(
			{
				reply,
				preview: null,
				pending: false,
				savedId: result.savedId,
				url: result.url,
				imageCount: result.imageCount ?? session.pendingImages.length,
				messages: session.messages,
			},
			200,
			cookie,
		);
	}

	session.pendingImages = mergeImages(session.pendingImages, incomingImages);

	// Merge de correções curtas no rascunho pendente (sem reextrair tudo)
	if (
		session.pendingDraft &&
		message &&
		incomingImages.length === 0 &&
		message.length < 800 &&
		!isConfirmation(message)
	) {
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
				const preview = formatPreview(full.data, session.pendingImages.length);
				session.pendingDraft = full.data;
				push(session, 'assistant', preview);
				await saveSession(session);
				return json(
					{
						reply: preview,
						preview,
						pending: true,
						imageCount: session.pendingImages.length,
						messages: session.messages,
					},
					200,
					cookie,
				);
			}
		}
		const ask = `Atualizei o rascunho (${session.pendingImages.length} foto(s)). Ainda faltam: ${missing.join(', ') || 'nada'}.`;
		push(session, 'assistant', ask);
		await saveSession(session);
		return json(
			{
				reply: ask,
				pending: true,
				draft: merged,
				imageCount: session.pendingImages.length,
				messages: session.messages,
			},
			200,
			cookie,
		);
	}

	const result = await callMcpTool(
		'extrair_banda',
		{
			texto: message,
			imagens: session.pendingImages.map((img) => ({
				base64: img.base64,
				mime: img.mime,
				filename: img.filename,
			})),
		},
		ctx,
	);

	session.pendingDraft = result.draft ?? session.pendingDraft;

	let reply = result.preview || result.message;
	if (session.pendingImages.length && result.missing && result.missing.length === 0) {
		// ensure preview reflects current image count (tool already does)
	} else if (session.pendingImages.length && result.preview && !/Fotos:/.test(result.preview)) {
		reply += `\n\nFotos no relatório: ${session.pendingImages.length}.`;
	}

	push(session, 'assistant', reply);
	await saveSession(session);

	return json(
		{
			reply,
			preview: result.preview,
			pending: Boolean(result.draft && (!result.missing || result.missing.length === 0)),
			missing: result.missing,
			draft: result.draft,
			imageCount: session.pendingImages.length,
			messages: session.messages,
		},
		200,
		cookie,
	);
}

function parseCorrecoes(text: string, current: Record<string, unknown>) {
	const out: Record<string, unknown> = {};
	const nextField =
		'(?=\\s*;?\\s*(?:cidade|uf|nome|forma(?:cao|ção)?|autor|e-?mail|lat(?:itude)?|lng|longitude|resumo|artigo)\\s*[:=]|\\s*$)';
	const fieldValue = (label: string) =>
		new RegExp(`${label}\\s*[:=]\\s*([^\\n]+?)${nextField}`, 'im').exec(text);

	const cidade = fieldValue('cidade');
	const uf = /\buf\s*[:=]\s*([A-Za-z]{2})\b/im.exec(text);
	const nome = fieldValue('nome');
	const formacao = /forma(?:cao|ção)?\s*[:=]\s*(\d{4})/im.exec(text);
	const autor = fieldValue('autor');
	const email = /e-?mail\s*[:=]\s*(\S+)/im.exec(text);
	const lat = /\blat(?:itude)?\s*[:=]\s*(-?\d+(?:\.\d+)?)/im.exec(text);
	const lng = /\b(?:lng|longitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)/im.exec(text);
	const resumo = fieldValue('resumo');

	if (cidade) out.cidade = cidade[1]!.trim();
	if (uf) out.uf = uf[1]!.toUpperCase();
	if (nome) out.nome = nome[1]!.trim();
	if (formacao) out.formacao = Number(formacao[1]);
	if (autor) out.autor = autor[1]!.trim();
	if (email) out.email = email[1]!.trim();
	if (lat) out.lat = Number(lat[1]);
	if (lng) out.lng = Number(lng[1]);
	if (resumo) out.resumo = resumo[1]!.trim();

	const artigo = /artigo\s*[:=]\s*([\s\S]+)/im.exec(text);
	if (artigo && artigo[1]!.trim().length >= 80) out.artigo = artigo[1]!.trim();

	if (!Object.keys(out).length && text.length >= 80) {
		out.artigo = text;
		if (!current.resumo) out.resumo = text.slice(0, 177).trim() + '…';
	}

	return out;
}
