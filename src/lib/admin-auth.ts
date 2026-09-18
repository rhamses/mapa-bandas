import { env } from 'cloudflare:workers';

const COOKIE = 'mb_admin_session';
const SESSION_PREFIX = 'admin:';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AdminSession = {
	user: string;
	createdAt: string;
};

function timingSafeEqual(a: string, b: string) {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.length !== bBytes.length) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i]! ^ bBytes[i]!;
	}
	return diff === 0;
}

async function sha256Hex(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function adminUser() {
	return (env.ADMIN_USER || '').trim() || 'admin';
}

async function passwordMatches(password: string) {
	const plain = env.ADMIN_PASSWORD;
	if (plain) {
		return timingSafeEqual(password, plain);
	}

	const salt = env.ADMIN_PASSWORD_SALT ?? '';
	const expected = env.ADMIN_PASSWORD_HASH ?? '';
	if (!expected) return false;

	const actual = await sha256Hex(`${salt}${password}`);
	return timingSafeEqual(actual, expected);
}

export async function verifyAdminCredentials(username: string, password: string) {
	if (!timingSafeEqual(username.trim(), adminUser())) return false;
	return passwordMatches(password);
}

function parseCookies(header: string | null) {
	const out = new Map<string, string>();
	if (!header) return out;
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx === -1) continue;
		const key = part.slice(0, idx).trim();
		const value = part.slice(idx + 1).trim();
		if (key) out.set(key, decodeURIComponent(value));
	}
	return out;
}

export function readSessionToken(request: Request) {
	return parseCookies(request.headers.get('cookie')).get(COOKIE) ?? null;
}

export async function getAdminSession(request: Request): Promise<AdminSession | null> {
	const token = readSessionToken(request);
	if (!token || token.length < 24) return null;
	const raw = await env.SESSION.get(`${SESSION_PREFIX}${token}`);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as AdminSession;
	} catch {
		return null;
	}
}

export async function createAdminSession(user: string) {
	const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
	const session: AdminSession = { user, createdAt: new Date().toISOString() };
	await env.SESSION.put(`${SESSION_PREFIX}${token}`, JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SECONDS,
	});
	return token;
}

export async function destroyAdminSession(request: Request) {
	const token = readSessionToken(request);
	if (token) {
		await env.SESSION.delete(`${SESSION_PREFIX}${token}`);
	}
}

export function sessionCookieHeader(token: string, secure: boolean) {
	const parts = [
		`${COOKIE}=${encodeURIComponent(token)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${SESSION_TTL_SECONDS}`,
	];
	if (secure) parts.push('Secure');
	return parts.join('; ');
}

export function clearSessionCookieHeader(secure: boolean) {
	const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
	if (secure) parts.push('Secure');
	return parts.join('; ');
}

export function isSecureRequest(request: Request) {
	return new URL(request.url).protocol === 'https:';
}

export function sameOrigin(request: Request) {
	const origin = request.headers.get('origin');
	if (origin) {
		try {
			return new URL(origin).origin === new URL(request.url).origin;
		} catch {
			return false;
		}
	}
	const referer = request.headers.get('referer');
	if (!referer) return true;
	try {
		return new URL(referer).origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}
