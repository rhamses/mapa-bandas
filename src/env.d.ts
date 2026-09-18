/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_MAPBOX_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface Window {
	htmx: typeof import('htmx.org').default;
}

declare namespace App {
	interface Locals {
		admin?: {
			user: string;
			createdAt: string;
		};
	}
}
