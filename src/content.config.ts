import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const bandas = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/bandas' }),
	schema: z.object({
		nome: z.string(),
		cidade: z.string(),
		uf: z.string().length(2),
		lat: z.number(),
		lng: z.number(),
		formacao: z.number().int(),
		encerramento: z.number().int().optional(),
		generos: z.array(z.string()),
		resumo: z.string(),
		publicadoEm: z.coerce.date(),
		destaque: z.boolean().default(false),
		imagem: z.string().optional(),
		autor: z.string().optional(),
		fontes: z
			.array(
				z.object({
					titulo: z.string(),
					url: z.string(),
				}),
			)
			.optional(),
	}),
});

export const collections = { bandas };
