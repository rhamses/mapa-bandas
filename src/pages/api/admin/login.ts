export const prerender = false;

import {
	createAdminSession,
	isSecureRequest,
	sameOrigin,
	sessionCookieHeader,
	verifyAdminCredentials,
} from '../../../lib/admin-auth';

export async function POST({ request }: { request: Request }) {
	if (!sameOrigin(request)) {
		return Response.redirect(new URL('/admin/login?erro=origem', request.url), 303);
	}

	const form = await request.formData();
	const username = String(form.get('username') ?? '').trim();
	const password = String(form.get('password') ?? '');

	const ok = await verifyAdminCredentials(username, password);
	if (!ok) {
		return Response.redirect(new URL('/admin/login?erro=credenciais', request.url), 303);
	}

	const token = await createAdminSession(username);
	return new Response(null, {
		status: 303,
		headers: {
			Location: '/admin',
			'Set-Cookie': sessionCookieHeader(token, isSecureRequest(request)),
		},
	});
}
