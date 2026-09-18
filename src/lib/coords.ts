/** Coordenadas aproximadas das capitais — usadas quando a contribuição não traz lat/lng. */
export const capitalCoords: Record<string, { lat: number; lng: number }> = {
	AC: { lat: -9.97499, lng: -67.8243 },
	AL: { lat: -9.66599, lng: -35.735 },
	AP: { lat: 0.03493, lng: -51.0694 },
	AM: { lat: -3.10194, lng: -60.025 },
	BA: { lat: -12.9718, lng: -38.5011 },
	CE: { lat: -3.71722, lng: -38.5433 },
	DF: { lat: -15.7797, lng: -47.9297 },
	ES: { lat: -20.3155, lng: -40.3128 },
	GO: { lat: -16.6864, lng: -49.2643 },
	MA: { lat: -2.53073, lng: -44.3068 },
	MT: { lat: -15.601, lng: -56.0974 },
	MS: { lat: -20.4697, lng: -54.6201 },
	MG: { lat: -19.9167, lng: -43.9345 },
	PA: { lat: -1.4554, lng: -48.4898 },
	PB: { lat: -7.11509, lng: -34.8641 },
	PR: { lat: -25.4284, lng: -49.2733 },
	PE: { lat: -8.0476, lng: -34.877 },
	PI: { lat: -5.08921, lng: -42.8016 },
	RJ: { lat: -22.9068, lng: -43.1729 },
	RN: { lat: -5.79448, lng: -35.211 },
	RS: { lat: -30.0346, lng: -51.2177 },
	RO: { lat: -8.76116, lng: -63.9004 },
	RR: { lat: 2.82384, lng: -60.6753 },
	SC: { lat: -27.5954, lng: -48.548 },
	SP: { lat: -23.5505, lng: -46.6333 },
	SE: { lat: -10.9472, lng: -37.0731 },
	TO: { lat: -10.1753, lng: -48.2982 },
};

export function coordsForUf(uf: string) {
	return capitalCoords[uf.toUpperCase()] ?? { lat: -14.235, lng: -51.9253 };
}
