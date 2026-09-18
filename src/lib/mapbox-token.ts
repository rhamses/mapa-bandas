import { env } from 'cloudflare:workers';

/**
 * Token Mapbox público (pk.…).
 * Prefere o binding/secret do Worker em runtime para o deploy não depender
 * de embutir o valor no build.
 */
export function getPublicMapboxToken(fallback = ''): string {
	try {
		const runtime = (env as Env & { PUBLIC_MAPBOX_TOKEN?: string }).PUBLIC_MAPBOX_TOKEN;
		if (typeof runtime === 'string' && runtime.trim()) {
			return runtime.trim();
		}
	} catch {
		// fora do runtime do Worker (ex.: análise estática)
	}
	return fallback.trim();
}
