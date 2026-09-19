import type { BandaModal } from '../alpine';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const BRAZIL_BOUNDS: mapboxgl.LngLatBoundsLike = [
	[-74.0, -33.8],
	[-32.4, 5.3],
];

type AlpineWithModal = {
	store(name: 'modal'): {
		show(banda: BandaModal): void;
	};
};

declare global {
	interface Window {
		Alpine: AlpineWithModal;
		htmx: unknown;
		__MAPBOX_TOKEN__?: string;
	}
}

type MapaFeature = {
	type: 'Feature';
	geometry: { type: 'Point'; coordinates: [number, number] };
	properties: Record<string, string | number | null>;
};

type MapaGeoJSON = {
	type: 'FeatureCollection';
	features: MapaFeature[];
};

type MapOptions = {
	token: string;
	geojson: MapaGeoJSON;
	anoMin: number;
	anoMax: number;
};

function formacaoAno(feature: MapaFeature) {
	return Number(feature.properties.formacao);
}

function filtrarPorAno(geojson: MapaGeoJSON, de: number, ate: number): MapaGeoJSON {
	return {
		type: 'FeatureCollection',
		features: geojson.features.filter((feature) => {
			const ano = formacaoAno(feature);
			return Number.isFinite(ano) && ano >= de && ano <= ate;
		}),
	};
}

function formatarIntervalo(de: number, ate: number) {
	return de === ate ? String(de) : `${de} – ${ate}`;
}

function showAviso(titulo: string, texto: string) {
	const aviso = document.getElementById('mapa-aviso');
	const tituloEl = document.getElementById('mapa-aviso-titulo');
	const textoEl = document.getElementById('mapa-aviso-texto');
	if (!aviso) return;
	if (tituloEl) tituloEl.textContent = titulo;
	if (textoEl) textoEl.textContent = texto;
	aviso.classList.remove('hidden');
	aviso.classList.add('grid');
}

export function initMapa({ token, geojson, anoMin, anoMax }: MapOptions) {
	const container = document.getElementById('mapa');
	if (!container) return;

	if (!token) {
		showAviso(
			'Mapa indisponível',
			'Não foi possível carregar o mapa agora. Volte em instantes ou explore o arquivo pelas bandas.',
		);
		return;
	}

	if (token.startsWith('sk.')) {
		showAviso(
			'Mapa indisponível',
			'Não foi possível carregar o mapa agora. Volte em instantes ou explore o arquivo pelas bandas.',
		);
		return;
	}

	mapboxgl.accessToken = token;

	const map = new mapboxgl.Map({
		container,
		style: 'mapbox://styles/mapbox/dark-v11',
		center: [-51.5, -14.2],
		zoom: 4.15,
		minZoom: 3.6,
		maxZoom: 16,
		maxBounds: BRAZIL_BOUNDS,
		attributionControl: false,
		locale: {
			'NavigationControl.ZoomIn': 'Aproximar',
			'NavigationControl.ZoomOut': 'Afastar',
		},
	});

	map.on('error', (event) => {
		console.error('Falha ao carregar o mapa', event.error?.message);
		showAviso(
			'O mapa não carregou',
			'Não foi possível carregar o mapa agora. Volte em instantes ou explore o arquivo pelas bandas.',
		);
	});

	map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
	map.addControl(
		new mapboxgl.AttributionControl({ compact: true }),
		'bottom-left',
	);

	let anoDe = anoMin;
	let anoAte = anoMax;

	const minInput = document.getElementById('filtro-ano-min') as HTMLInputElement | null;
	const maxInput = document.getElementById('filtro-ano-max') as HTMLInputElement | null;
	const labelEl = document.getElementById('filtro-ano-label');
	const contagemEl = document.getElementById('filtro-ano-contagem');
	const trackFill = document.getElementById('filtro-ano-fill');

	function sincronizarSlider() {
		if (minInput) {
			minInput.value = String(anoDe);
			minInput.style.zIndex = anoDe >= anoAte - 1 ? '4' : '3';
		}
		if (maxInput) {
			maxInput.value = String(anoAte);
			maxInput.style.zIndex = '3';
		}
		if (labelEl) labelEl.textContent = formatarIntervalo(anoDe, anoAte);

		const span = Math.max(anoMax - anoMin, 1);
		const left = ((anoDe - anoMin) / span) * 100;
		const right = ((anoAte - anoMin) / span) * 100;
		if (trackFill) {
			trackFill.style.left = `${left}%`;
			trackFill.style.width = `${Math.max(right - left, 0)}%`;
		}

		const filtrado = filtrarPorAno(geojson, anoDe, anoAte);
		if (contagemEl) {
			const n = filtrado.features.length;
			contagemEl.textContent = n === 1 ? '1 banda' : `${n} bandas`;
		}
		return filtrado;
	}

	function aplicarFiltro() {
		const filtrado = sincronizarSlider();
		const source = map.getSource('bandas') as mapboxgl.GeoJSONSource | undefined;
		if (!source) return;
		source.setData(filtrado);
	}

	function onMinChange() {
		if (!minInput) return;
		anoDe = Math.min(Number(minInput.value), anoAte);
		aplicarFiltro();
	}

	function onMaxChange() {
		if (!maxInput) return;
		anoAte = Math.max(Number(maxInput.value), anoDe);
		aplicarFiltro();
	}

	minInput?.addEventListener('input', onMinChange);
	maxInput?.addEventListener('input', onMaxChange);
	sincronizarSlider();

	map.on('load', () => {
		map.resize();
		map.addSource('bandas', {
			type: 'geojson',
			data: filtrarPorAno(geojson, anoDe, anoAte),
			cluster: true,
			clusterMaxZoom: 11,
			clusterRadius: 56,
		});

		map.addLayer({
			id: 'clusters',
			type: 'circle',
			source: 'bandas',
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': [
					'step',
					['get', 'point_count'],
					'#d4a84b',
					6,
					'#c45c26',
					14,
					'#7a3428',
				],
				'circle-radius': ['step', ['get', 'point_count'], 18, 6, 24, 14, 32],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#f4ead8',
			},
		});

		map.addLayer({
			id: 'cluster-count',
			type: 'symbol',
			source: 'bandas',
			filter: ['has', 'point_count'],
			layout: {
				'text-field': ['get', 'point_count_abbreviated'],
				'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
				'text-size': 13,
			},
			paint: {
				'text-color': '#14110e',
			},
		});

		map.addLayer({
			id: 'unclustered-point',
			type: 'circle',
			source: 'bandas',
			filter: ['!', ['has', 'point_count']],
			paint: {
				'circle-color': '#c45c26',
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 9, 14, 12],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#f4ead8',
			},
		});

		map.addLayer({
			id: 'unclustered-label',
			type: 'symbol',
			source: 'bandas',
			filter: ['!', ['has', 'point_count']],
			minzoom: 8,
			layout: {
				'text-field': ['get', 'nome'],
				'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
				'text-size': 12,
				'text-offset': [0, 1.25],
				'text-anchor': 'top',
			},
			paint: {
				'text-color': '#f4ead8',
				'text-halo-color': '#14110e',
				'text-halo-width': 1.2,
			},
		});

		map.on('click', 'clusters', (event) => {
			const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
			if (!feature || feature.geometry.type !== 'Point') return;
			const clusterId = feature.properties?.cluster_id as number;
			const source = map.getSource('bandas') as mapboxgl.GeoJSONSource;
			source.getClusterExpansionZoom(clusterId, (error, zoom) => {
				if (error || zoom == null) return;
				map.easeTo({
					center: feature.geometry.coordinates as [number, number],
					zoom,
				});
			});
		});

		map.on('click', 'unclustered-point', (event) => {
			const feature = event.features?.[0];
			if (!feature?.properties) return;
			const props = feature.properties;
			window.Alpine.store('modal').show({
				id: String(props.id),
				nome: String(props.nome),
				cidade: String(props.cidade),
				uf: String(props.uf),
				formacao: Number(props.formacao),
				encerramento:
					props.encerramento && props.encerramento !== 'null'
						? Number(props.encerramento)
						: null,
				generos: String(props.generos),
				resumo: String(props.resumo),
				url: String(props.url),
			});
		});

		for (const layer of ['clusters', 'unclustered-point']) {
			map.on('mouseenter', layer, () => {
				map.getCanvas().style.cursor = 'pointer';
			});
			map.on('mouseleave', layer, () => {
				map.getCanvas().style.cursor = '';
			});
		}
	});
}
