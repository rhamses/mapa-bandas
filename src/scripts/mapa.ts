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
	}
}

type MapOptions = {
	token: string;
	geojson: {
		type: 'FeatureCollection';
		features: Array<{
			type: 'Feature';
			geometry: { type: 'Point'; coordinates: [number, number] };
			properties: Record<string, string | number | null>;
		}>;
	};
};

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

export function initMapa({ token, geojson }: MapOptions) {
	const container = document.getElementById('mapa');
	if (!container) return;

	if (!token) {
		showAviso(
			'Falta o token do mapa',
			'Crie um token público (começa com pk.) em account.mapbox.com, coloque em PUBLIC_MAPBOX_TOKEN no .env e reinicie o npm run dev.',
		);
		return;
	}

	if (token.startsWith('sk.')) {
		showAviso(
			'Este token é secreto',
			'O Mapbox GL no navegador só aceita token público, que começa com pk. Crie um default public token em account.mapbox.com, troque no .env e reinicie o servidor. Revogue o token sk. se ele já foi usado neste site.',
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
		const message = event.error?.message ?? 'Não foi possível carregar o Mapbox.';
		showAviso('O mapa não carregou', message);
	});

	map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
	map.addControl(
		new mapboxgl.AttributionControl({ compact: true }),
		'bottom-left',
	);

	map.on('load', () => {
		map.resize();
		map.addSource('bandas', {
			type: 'geojson',
			data: geojson,
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
