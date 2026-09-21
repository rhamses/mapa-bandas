import { bandaDraftSchema, missingFields, type BandaDraft, type BandaDraftPartial } from './schema';
import { extractBandaInput, type AiBinding } from './extract';
import { enrichCoords } from './geocode';
import { draftId, draftToMarkdown, formatPreview } from './format';
import { saveSubmissao, type ImagemMeta } from '../src/lib/submissoes';

export type McpToolResult = {
	ok: boolean;
	message: string;
	draft?: BandaDraftPartial;
	preview?: string;
	missing?: string[];
	savedId?: string;
	url?: string;
};

export type McpToolContext = {
	mapboxToken: string;
	ai?: AiBinding | null;
};

export const MCP_TOOLS = [
	{
		name: 'extrair_banda',
		description:
			'Recebe texto e/ou imagem sobre uma banda brasileira e devolve um rascunho estruturado + prévia para aprovação (ainda não salva).',
		inputSchema: {
			type: 'object',
			properties: {
				texto: { type: 'string', description: 'Texto livre com dados da banda' },
				imagem_base64: {
					type: 'string',
					description: 'Imagem opcional em base64 (jpeg/png/webp)',
				},
				imagem_mime: { type: 'string', description: 'MIME da imagem, ex: image/jpeg' },
			},
		},
	},
	{
		name: 'aprovar_banda',
		description:
			'Confirma e grava no banco (status aprovada) um rascunho já validado, para aparecer no site.',
		inputSchema: {
			type: 'object',
			properties: {
				draft: { type: 'object', description: 'Objeto BandaDraft completo' },
				confirmacao: {
					type: 'string',
					description: 'Deve ser "sim" para confirmar',
				},
				imagem_base64: { type: 'string' },
				imagem_mime: { type: 'string' },
			},
			required: ['draft', 'confirmacao'],
		},
	},
] as const;

function decodeBase64Image(
	base64?: string,
	mime = 'image/jpeg',
): { bytes: Uint8Array; meta: ImagemMeta } | null {
	if (!base64) return null;
	const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
	const binary = atob(cleaned);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
	return {
		bytes,
		meta: {
			contentType: mime,
			filename: `agente.${ext}`,
			ext,
		},
	};
}

export async function toolExtrairBanda(
	args: { texto?: string; imagem_base64?: string; imagem_mime?: string },
	ctx: McpToolContext,
): Promise<McpToolResult> {
	const texto = (args.texto ?? '').trim();
	const image = decodeBase64Image(args.imagem_base64, args.imagem_mime);
	if (!texto && !image) {
		return { ok: false, message: 'Envie um texto ou uma imagem sobre a banda.' };
	}

	let draft = await extractBandaInput({
		text: texto || 'Extraia os dados da banda na imagem.',
		imageBytes: image?.bytes,
		ai: ctx.ai,
	});
	draft = await enrichCoords(draft, ctx.mapboxToken);

	const missing = missingFields(draft);
	const previewCandidate = { ...draft };
	const previewText =
		missing.length === 0
			? formatPreview(bandaDraftSchema.parse(draft) as BandaDraft)
			: [
					'## Rascunho incompleto',
					'',
					'Consegui extrair parte dos dados, mas ainda faltam:',
					...missing.map((f) => `- ${f}`),
					'',
					'```json',
					JSON.stringify(previewCandidate, null, 2),
					'```',
					'',
					'Envie as informações que faltam (ou uma imagem/flyer) para eu completar a prévia.',
				].join('\n');

	return {
		ok: true,
		message:
			missing.length === 0
				? 'Prévia pronta. Confirme com "sim" para publicar no acervo.'
				: 'Rascunho incompleto — faltam campos.',
		draft,
		preview: previewText,
		missing,
	};
}

export async function toolAprovarBanda(
	args: {
		draft: unknown;
		confirmacao: string;
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
	const image = decodeBase64Image(args.imagem_base64, args.imagem_mime);
	const imagemPath = image ? `/media/submissoes/${id}/0.${image.meta.ext}` : undefined;
	const markdown = draftToMarkdown(draft, id, imagemPath);

	try {
		await saveSubmissao({
			id,
			markdown,
			email: draft.email,
			imagens: image ? [image] : [],
			status: 'aprovada',
		});
	} catch (error) {
		console.error('Falha ao salvar via MCP', error);
		return { ok: false, message: 'Não foi possível gravar no banco agora. Tente de novo.' };
	}

	return {
		ok: true,
		message: `Publicado: ${draft.nome} já deve aparecer no arquivo e no mapa.`,
		savedId: id,
		url: `/bandas/${id}`,
		draft,
	};
}

export async function callMcpTool(
	name: string,
	args: Record<string, unknown>,
	ctx: McpToolContext,
): Promise<McpToolResult> {
	if (name === 'extrair_banda') {
		return toolExtrairBanda(
			{
				texto: typeof args.texto === 'string' ? args.texto : '',
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
				imagem_base64: typeof args.imagem_base64 === 'string' ? args.imagem_base64 : undefined,
				imagem_mime: typeof args.imagem_mime === 'string' ? args.imagem_mime : undefined,
			},
			ctx,
		);
	}
	return { ok: false, message: `Tool desconhecida: ${name}` };
}
