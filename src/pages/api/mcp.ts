export const prerender = false;

import { env } from 'cloudflare:workers';
import { callMcpTool, MCP_TOOLS } from '../../../mcp/index';
import { getPublicMapboxToken } from '../../lib/mapbox-token';
import { PUBLIC_MAPBOX_TOKEN } from 'astro:env/client';

type McpBody = {
	method?: string;
	params?: {
		name?: string;
		arguments?: Record<string, unknown>;
	};
};

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

function aiBinding() {
	const ai = (env as Env & { AI?: { run: (m: string, i: Record<string, unknown>) => Promise<unknown> } }).AI;
	return ai ?? null;
}

export async function GET() {
	return json({
		name: 'mapa-bandas-mcp',
		version: '1.0.0',
		tools: MCP_TOOLS,
	});
}

export async function POST({ request }: { request: Request }) {
	let body: McpBody;
	try {
		body = (await request.json()) as McpBody;
	} catch {
		return json({ error: 'JSON inválido' }, 400);
	}

	const method = body.method ?? 'tools/list';
	if (method === 'tools/list') {
		return json({ tools: MCP_TOOLS });
	}

	if (method === 'tools/call') {
		const name = body.params?.name;
		const args = body.params?.arguments ?? {};
		if (!name) return json({ error: 'params.name obrigatório' }, 400);
		const result = await callMcpTool(name, args, {
			mapboxToken: getPublicMapboxToken(PUBLIC_MAPBOX_TOKEN),
			ai: aiBinding(),
		});
		return json({ content: [{ type: 'text', text: JSON.stringify(result) }], result });
	}

	return json({ error: `method não suportado: ${method}` }, 400);
}
