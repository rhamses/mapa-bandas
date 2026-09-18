/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_MAPBOX_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface Window {
	htmx: typeof import('htmx.org').default;
	__MAPBOX_TOKEN__?: string;
}

declare namespace App {
	interface Locals {
		admin?: {
			user: string;
			createdAt: string;
		};
	}
}
