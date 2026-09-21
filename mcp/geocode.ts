import { isValidBrazilCoords, isValidUf, ufFromMapboxShortCode } from '../src/lib/location';
import type { BandaDraftPartial } from './schema';

type MapboxFeature = {
	id?: string;
	place_name?: string;
	center?: [number, number];
	context?: Array<{ id?: string; short_code?: string; text?: string }>;
	text?: string;
};

export async function geocodeCidadeUf(
	cidade: string,
	uf: string,
	token: string,
): Promise<{ lat: number; lng: number; cidade: string; uf: string } | null> {
	if (!token || !cidade.trim()) return null;
	const query = encodeURIComponent(`${cidade}, ${uf}, Brasil`);
	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${token}&country=BR&types=place,locality&language=pt&limit=1`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = (await res.json()) as { features?: MapboxFeature[] };
	const feature = data.features?.[0];
	if (!feature?.center) return null;
	const [lng, lat] = feature.center;
	if (!isValidBrazilCoords(lat, lng)) return null;

	let resolvedUf = uf.toUpperCase();
	if (!isValidUf(resolvedUf)) {
		const ctx = feature.context?.find((c) => c.id?.startsWith('region'));
		resolvedUf = ufFromMapboxShortCode(ctx?.short_code) ?? resolvedUf;
	}
	if (!isValidUf(resolvedUf)) return null;

	return {
		lat,
		lng,
		cidade: feature.text || cidade,
		uf: resolvedUf,
	};
}

export async function enrichCoords(
	draft: BandaDraftPartial,
	token: string,
): Promise<BandaDraftPartial> {
	if (
		typeof draft.lat === 'number' &&
		typeof draft.lng === 'number' &&
		isValidBrazilCoords(draft.lat, draft.lng) &&
		draft.uf &&
		isValidUf(draft.uf)
	) {
		return draft;
	}
	if (!draft.cidade || !draft.uf) return draft;
	const geo = await geocodeCidadeUf(draft.cidade, draft.uf, token);
	if (!geo) return draft;
	return { ...draft, ...geo };
}
