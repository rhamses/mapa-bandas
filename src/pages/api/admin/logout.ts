export const prerender = false;

import {
	clearSessionCookieHeader,
	destroyAdminSession,
	isSecureRequest,
	sameOrigin,
} from '../../../lib/admin-auth';

export async function POST({ request }: { request: Request }) {
	if (!sameOrigin(request)) {
		return new Response('Origem inválida.', { status: 403 });
	}

	await destroyAdminSession(request);
	return new Response(null, {
		status: 303,
		headers: {
			Location: '/admin/login',
			'Set-Cookie': clearSessionCookieHeader(isSecureRequest(request)),
		},
	});
}
