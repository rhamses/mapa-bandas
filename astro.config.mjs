// @ts-check
import alpinejs from '@astrojs/alpinejs';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import icon from 'astro-icon';
import { submissoesDiskMirror } from './scripts/submissoes-disk-mirror.mjs';

export default defineConfig({
	site: 'https://mapa-bandas.rhamses.workers.dev',
	adapter: cloudflare({
		imageService: 'passthrough',
	}),
	integrations: [
		alpinejs({ entrypoint: '/src/alpine' }),
		icon({
			include: {
				lucide: [
					'map',
					'search',
					'mic-vocal',
					'pen-line',
					'rss',
					'arrow-right',
					'arrow-left',
					'map-pin',
					'calendar',
					'music',
					'x',
					'menu',
					'send',
					'external-link',
					'chevrons-up-down',
					'globe',
					'book-open',
					'image',
					'image-plus',
				],
			},
		}),
		sitemap({
			filter: (page) => !page.includes('/api/') && !page.includes('/partials/'),
		}),
	],
	vite: {
		plugins: [tailwindcss(), submissoesDiskMirror()],
	},
	env: {
		schema: {
			PUBLIC_MAPBOX_TOKEN: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
				default: '',
			}),
		},
	},
});
