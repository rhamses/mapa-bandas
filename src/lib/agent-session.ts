import { env } from 'cloudflare:workers';
import type { BandaDraftPartial } from '../../mcp/schema';

const COOKIE = 'mb_agent_session';
const TTL_SECONDS = 60 * 60 * 24;

export type AgentMessage = {
	role: 'user' | 'assistant';
	content: string;
	at: string;
};

export type AgentSession = {
	id: string;
	pendingDraft: BandaDraftPartial | null;
	pendingImageBase64?: string;
	pendingImageMime?: string;
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

export async function loadSession(id: string): Promise<AgentSession | null> {
	const raw = await env.SESSION.get(key(id));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as AgentSession;
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
		messages: [],
		updatedAt: new Date().toISOString(),
	};
	await saveSession(session);
	return session;
}

export function isConfirmation(text: string) {
	return /^(sim|s|yes|aprovar|confirma|confirmar|salvar|publicar)!?[.!]?\s*$/i.test(text.trim());
}
