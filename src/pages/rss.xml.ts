export const prerender = false;

import rss from '@astrojs/rss';
import { getBandas, permalink } from '../lib/bandas';
import { site } from '../lib/site';

export async function GET(context: { site?: URL }) {
	const bandas = await getBandas();

	return rss({
		title: site.nome,
		description: site.descricao,
		site: context.site ?? site.url,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		customData: `<language>pt-BR</language><atom:link href="${new URL('/rss.xml', context.site ?? site.url).href}" rel="self" type="application/rss+xml" />`,
		items: bandas.map((banda) => ({
			title: banda.data.nome,
			description: banda.data.resumo,
			pubDate: banda.data.publicadoEm,
			link: permalink(banda),
			categories: [...banda.data.generos, banda.data.uf, banda.data.cidade],
		})),
	});
}
