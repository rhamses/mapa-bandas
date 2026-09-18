import type { Uf } from './site';
import { ufs } from './site';

const ufSet = new Set(ufs.map((uf) => uf.sigla));

/** Limites aproximados do Brasil para rejeitar pontos fora do mapa. */
export const BRAZIL_BOUNDS = {
	minLat: -34.0,
	maxLat: 5.5,
	minLng: -74.0,
	maxLng: -32.0,
} as const;

export function isValidBrazilCoords(lat: number, lng: number) {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= BRAZIL_BOUNDS.minLat &&
		lat <= BRAZIL_BOUNDS.maxLat &&
		lng >= BRAZIL_BOUNDS.minLng &&
		lng <= BRAZIL_BOUNDS.maxLng
	);
}

export function isValidUf(value: string): value is Uf {
	return ufSet.has(value as Uf);
}

export function ufFromMapboxShortCode(shortCode: string | undefined | null): Uf | null {
	if (!shortCode) return null;
	const normalized = shortCode.trim().toUpperCase();
	if (normalized.startsWith('BR-') && isValidUf(normalized.slice(3))) {
		return normalized.slice(3) as Uf;
	}
	if (normalized.length === 2 && isValidUf(normalized)) {
		return normalized as Uf;
	}
	return null;
}
