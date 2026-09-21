import { z } from 'zod';

/** Rascunho de banda no formato do acervo (frontmatter + artigo). */
export const bandaDraftSchema = z.object({
	nome: z.string().min(2),
	cidade: z.string().min(2),
	uf: z.string().length(2),
	lat: z.number().finite(),
	lng: z.number().finite(),
	formacao: z.number().int().min(1900).max(2100),
	encerramento: z.number().int().min(1900).max(2100).optional(),
	generos: z.array(z.string().min(1)).default([]),
	resumo: z.string().min(10),
	artigo: z.string().min(80),
	autor: z.string().min(2).default('Agente MCP'),
	email: z.string().email().optional(),
	fontes: z
		.array(
			z.object({
				titulo: z.string(),
				url: z.string(),
			}),
		)
		.default([]),
	creditoPublico: z.boolean().default(true),
});

export type BandaDraft = z.infer<typeof bandaDraftSchema>;

export type BandaDraftPartial = Partial<BandaDraft> & {
	nome?: string;
	cidade?: string;
	uf?: string;
};

export const REQUIRED_FIELDS = [
	'nome',
	'cidade',
	'uf',
	'lat',
	'lng',
	'formacao',
	'resumo',
	'artigo',
	'autor',
] as const;

export function missingFields(draft: BandaDraftPartial): string[] {
	const missing: string[] = [];
	for (const key of REQUIRED_FIELDS) {
		const value = draft[key];
		if (value === undefined || value === null || value === '') missing.push(key);
		if (typeof value === 'number' && !Number.isFinite(value)) missing.push(key);
	}
	if (draft.artigo && draft.artigo.length < 80) missing.push('artigo');
	return [...new Set(missing)];
}
