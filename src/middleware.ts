import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from './lib/admin-auth';

export const onRequest = defineMiddleware(async (context, next) => {
	const path = context.url.pathname;
	const isAdminPage = path === '/admin' || path.startsWith('/admin/');
	const isAdminApi = path === '/api/admin' || path.startsWith('/api/admin/');

	if (!isAdminPage && !isAdminApi) {
		return next();
	}

	if (path === '/admin/login' || path === '/api/admin/login') {
		return next();
	}

	const session = await getAdminSession(context.request);
	if (!session) {
		if (isAdminApi) {
			return new Response('Não autenticado.', { status: 401 });
		}
		return context.redirect('/admin/login');
	}

	context.locals.admin = session;
	return next();
});
