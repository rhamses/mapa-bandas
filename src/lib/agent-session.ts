import { env } from 'cloudflare:workers';
import type { BandaDraftPartial } from '../../mcp/schema';

const COOKIE = 'mb_agent_session';
const TTL_SECONDS = 60 * 60 * 24;

export type AgentMessage = {
	role: 'user' | 'assistant';
	content: string;
	at: string;
};

export type PendingImage = {
	base64: string;
	mime: string;
	filename?: string;
};

export type AgentSession = {
	id: string;
	pendingDraft: BandaDraftPartial | null;
	/** @deprecated use pendingImages */
	pendingImageBase64?: string;
	/** @deprecated use pendingImages */
	pendingImageMime?: string;
	pendingImages: PendingImage[];
	messages: AgentMessage[];
	updatedAt: string;
};

function key(id: string) {
	return `agent:session:${id}`;
}

export function readSessionId(request: Request): string | null {
	const cookie = request.headers.get('Cookie') || '';
	const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
	return match ? decodeURIComponent(match[1]!) : null;
}

export function sessionCookie(id: string) {
	return `${COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

function normalizeSession(raw: AgentSession): AgentSession {
	const pendingImages = Array.isArray(raw.pendingImages) ? raw.pendingImages : [];
	if (
		pendingImages.length === 0 &&
		typeof raw.pendingImageBase64 === 'string' &&
		raw.pendingImageBase64
	) {
		pendingImages.push({
			base64: raw.pendingImageBase64,
			mime: raw.pendingImageMime || 'image/jpeg',
		});
	}
	return { ...raw, pendingImages };
}

export async function loadSession(id: string): Promise<AgentSession | null> {
	const raw = await env.SESSION.get(key(id));
	if (!raw) return null;
	try {
		return normalizeSession(JSON.parse(raw) as AgentSession);
	} catch {
		return null;
	}
}

export async function saveSession(session: AgentSession) {
	session.updatedAt = new Date().toISOString();
	await env.SESSION.put(key(session.id), JSON.stringify(session), {
		expirationTtl: TTL_SECONDS,
	});
}

export async function getOrCreateSession(request: Request): Promise<AgentSession> {
	const existingId = readSessionId(request);
	if (existingId) {
		const existing = await loadSession(existingId);
		if (existing) return existing;
	}
	const id = crypto.randomUUID();
	const session: AgentSession = {
		id,
		pendingDraft: null,
		pendingImages: [],
		messages: [],
		updatedAt: new Date().toISOString(),
	};
	await saveSession(session);
	return session;
}

export function isConfirmation(text: string) {
	return /^(sim|s|yes|aprovar|confirma|confirmar|salvar|publicar)!?[.!]?\s*$/i.test(text.trim());
}

export function clearPendingMedia(session: AgentSession) {
	session.pendingDraft = null;
	session.pendingImages = [];
	session.pendingImageBase64 = undefined;
	session.pendingImageMime = undefined;
}
