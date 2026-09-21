import { bandaDraftSchema, missingFields, type BandaDraft, type BandaDraftPartial } from './schema';
import { extractBandaInput, type AiBinding } from './extract';
import { enrichCoords } from './geocode';
import { draftId, draftToMarkdown, formatPreview } from './format';
import { saveSubmissao, type ImagemMeta } from '../src/lib/submissoes';

export const MAX_AGENT_IMAGES = 8;

export type McpImageInput = {
	base64: string;
	mime?: string;
	filename?: string;
};

export type DecodedImage = { bytes: Uint8Array; meta: ImagemMeta };

export type McpToolResult = {
	ok: boolean;
	message: string;
	draft?: BandaDraftPartial;
	preview?: string;
	missing?: string[];
	savedId?: string;
	url?: string;
	imageCount?: number;
};

export type McpToolContext = {
	mapboxToken: string;
	ai?: AiBinding | null;
};

export const MCP_TOOLS = [
	{
		name: 'extrair_banda',
		description:
			'Recebe texto e/ou uma coleção de imagens sobre uma banda brasileira e devolve um rascunho estruturado + prévia para aprovação (ainda não salva). As imagens entram no mesmo relatório.',
		inputSchema: {
			type: 'object',
			properties: {
				texto: { type: 'string', description: 'Texto livre com dados da banda' },
				imagens: {
					type: 'array',
					description: 'Coleção de imagens (até 8) em base64 para o mesmo relatório',
					items: {
						type: 'object',
						properties: {
							base64: { type: 'string' },
							mime: { type: 'string' },
							filename: { type: 'string' },
						},
						required: ['base64'],
					},
				},
				imagem_base64: {
					type: 'string',
					description: 'Compat: imagem única em base64',
				},
				imagem_mime: { type: 'string', description: 'MIME da imagem única' },
			},
		},
	},
	{
		name: 'aprovar_banda',
		description:
			'Confirma e grava no banco (status aprovada) um rascunho já validado, incluindo a coleção de imagens do relatório.',
		inputSchema: {
			type: 'object',
			properties: {
				draft: { type: 'object', description: 'Objeto BandaDraft completo' },
				confirmacao: {
					type: 'string',
					description: 'Deve ser "sim" para confirmar',
				},
				imagens: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							base64: { type: 'string' },
							mime: { type: 'string' },
							filename: { type: 'string' },
						},
						required: ['base64'],
					},
				},
				imagem_base64: { type: 'string' },
				imagem_mime: { type: 'string' },
			},
			required: ['draft', 'confirmacao'],
		},
	},
] as const;

export function decodeBase64Image(
	base64?: string,
	mime = 'image/jpeg',
	filename?: string,
): DecodedImage | null {
	if (!base64) return null;
	const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
	const binary = atob(cleaned);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	const ext = mime.includes('png')
		? 'png'
		: mime.includes('webp')
			? 'webp'
			: mime.includes('gif')
				? 'gif'
				: 'jpg';
	return {
		bytes,
		meta: {
			contentType: mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
			filename: filename || `agente.${ext}`,
			ext,
		},
	};
}

export function collectImages(args: {
	imagens?: unknown;
	imagem_base64?: string;
	imagem_mime?: string;
}): DecodedImage[] {
	const out: DecodedImage[] = [];
	if (Array.isArray(args.imagens)) {
		for (const item of args.imagens) {
			if (!item || typeof item !== 'object') continue;
			const row = item as Record<string, unknown>;
			const base64 = typeof row.base64 === 'string' ? row.base64 : undefined;
			const mime = typeof row.mime === 'string' ? row.mime : 'image/jpeg';
			const filename = typeof row.filename === 'string' ? row.filename : undefined;
			const decoded = decodeBase64Image(base64, mime, filename);
			if (decoded) out.push(decoded);
			if (out.length >= MAX_AGENT_IMAGES) break;
		}
	}
	if (out.length === 0 && args.imagem_base64) {
		const one = decodeBase64Image(args.imagem_base64, args.imagem_mime);
		if (one) out.push(one);
	}
	return out.slice(0, MAX_AGENT_IMAGES);
}

export async function toolExtrairBanda(
	args: {
		texto?: string;
		imagens?: McpImageInput[];
		imagem_base64?: string;
		imagem_mime?: string;
	},
	ctx: McpToolContext,
): Promise<McpToolResult> {
	const texto = (args.texto ?? '').trim();
	const images = collectImages(args);
	if (!texto && images.length === 0) {
		return { ok: false, message: 'Envie um texto ou uma ou mais imagens sobre a banda.' };
	}

	let draft = await extractBandaInput({
		text: texto || 'Extraia os dados da banda nas imagens enviadas.',
		imageBytes: images[0]?.bytes,
		ai: ctx.ai,
	});
	draft = await enrichCoords(draft, ctx.mapboxToken);

	const missing = missingFields(draft);
	const previewCandidate = { ...draft };
	const basePreview =
		missing.length === 0
			? formatPreview(bandaDraftSchema.parse(draft) as BandaDraft, images.length)
			: [
					'## Rascunho incompleto',
					'',
					'Consegui extrair parte dos dados, mas ainda faltam:',
					...missing.map((f) => `- ${f}`),
					'',
					images.length
						? `Imagens anexadas ao relatório: ${images.length}.`
						: 'Nenhuma imagem anexada ainda.',
					'',
					'```json',
					JSON.stringify(previewCandidate, null, 2),
					'```',
					'',
					'Envie as informações que faltam (ou mais imagens) para eu completar a prévia.',
				].join('\n');

	return {
		ok: true,
		message:
			missing.length === 0
				? 'Prévia pronta. Confirme com "sim" para publicar no acervo.'
				: 'Rascunho incompleto — faltam campos.',
		draft,
		preview: basePreview,
		missing,
		imageCount: images.length,
	};
}

export async function toolAprovarBanda(
	args: {
		draft: unknown;
		confirmacao: string;
		imagens?: McpImageInput[];
		imagem_base64?: string;
		imagem_mime?: string;
	},
	_ctx: McpToolContext,
): Promise<McpToolResult> {
	const conf = args.confirmacao.trim().toLowerCase();
	if (!/^(sim|s|yes|aprovar|confirma|confirmar|salvar|publicar)$/i.test(conf)) {
		return {
			ok: false,
			message: 'Para gravar, envie confirmação "sim" (ou aprovar / publicar).',
		};
	}

	const parsed = bandaDraftSchema.safeParse(args.draft);
	if (!parsed.success) {
		return {
			ok: false,
			message: `Rascunho inválido: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
			missing: parsed.error.issues.map((i) => i.path.join('.') || 'campo'),
		};
	}

	const draft = parsed.data;
	const id = draftId(draft);
	const images = collectImages(args);
	const imagemPaths = images.map((img, index) => `/media/submissoes/${id}/${index}.${img.meta.ext}`);
	const markdown = draftToMarkdown(draft, id, imagemPaths);

	try {
		await saveSubmissao({
			id,
			markdown,
			email: draft.email,
			imagens: images,
			status: 'aprovada',
		});
	} catch (error) {
		console.error('Falha ao salvar via MCP', error);
		return { ok: false, message: 'Não foi possível gravar no banco agora. Tente de novo.' };
	}

	const fotos =
		images.length === 0
			? 'sem fotos'
			: images.length === 1
				? '1 foto'
				: `${images.length} fotos`;

	return {
		ok: true,
		message: `Publicado: ${draft.nome} (${fotos}) já deve aparecer no arquivo e no mapa.`,
		savedId: id,
		url: `/bandas/${id}`,
		draft,
		imageCount: images.length,
	};
}

export async function callMcpTool(
	name: string,
	args: Record<string, unknown>,
	ctx: McpToolContext,
): Promise<McpToolResult> {
	const imagens = Array.isArray(args.imagens) ? (args.imagens as McpImageInput[]) : undefined;
	if (name === 'extrair_banda') {
		return toolExtrairBanda(
			{
				texto: typeof args.texto === 'string' ? args.texto : '',
				imagens,
				imagem_base64: typeof args.imagem_base64 === 'string' ? args.imagem_base64 : undefined,
				imagem_mime: typeof args.imagem_mime === 'string' ? args.imagem_mime : undefined,
			},
			ctx,
		);
	}
	if (name === 'aprovar_banda') {
		return toolAprovarBanda(
			{
				draft: args.draft,
				confirmacao: typeof args.confirmacao === 'string' ? args.confirmacao : '',
				imagens,
				imagem_base64: typeof args.imagem_base64 === 'string' ? args.imagem_base64 : undefined,
				imagem_mime: typeof args.imagem_mime === 'string' ? args.imagem_mime : undefined,
			},
			ctx,
		);
	}
	return { ok: false, message: `Tool desconhecida: ${name}` };
}
