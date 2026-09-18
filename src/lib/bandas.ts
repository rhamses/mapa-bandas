import { getCollection, type CollectionEntry } from 'astro:content';

export type Banda = CollectionEntry<'bandas'>;

export type BandaMapa = {
	id: string;
	nome: string;
	cidade: string;
	uf: string;
	formacao: number;
	encerramento: number | null;
	generos: string;
	resumo: string;
	url: string;
};

export function permalink(banda: Banda) {
	return `/bandas/${banda.id}`;
}

export function periodo(banda: Banda) {
	const { formacao, encerramento } = banda.data;
	return encerramento ? `${formacao}–${encerramento}` : `${formacao}–hoje`;
}

export function local(banda: Banda) {
	return `${banda.data.cidade}, ${banda.data.uf}`;
}

export function buscaBandas(bandas: Banda[], query: string) {
	const termo = query.trim().toLowerCase();
	if (!termo) return bandas;

	return bandas.filter((banda) => {
		const haystack = [
			banda.data.nome,
			banda.data.cidade,
			banda.data.uf,
			banda.data.resumo,
			...banda.data.generos,
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(termo);
	});
}

export function sortByRecentes(bandas: Banda[]) {
	return [...bandas].sort(
		(a, b) => b.data.publicadoEm.valueOf() - a.data.publicadoEm.valueOf(),
	);
}

export async function getBandas() {
	const bandas = await getCollection('bandas');
	return sortByRecentes(bandas);
}

export function toMapaFeatures(bandas: Banda[]) {
	return {
		type: 'FeatureCollection',
		features: bandas.map((banda) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [banda.data.lng, banda.data.lat],
			},
			properties: {
				id: banda.id,
				nome: banda.data.nome,
				cidade: banda.data.cidade,
				uf: banda.data.uf,
				formacao: banda.data.formacao,
				encerramento: banda.data.encerramento ?? null,
				generos: banda.data.generos.join(' · '),
				resumo: banda.data.resumo,
				url: permalink(banda),
			} satisfies BandaMapa,
		})),
	};
}
