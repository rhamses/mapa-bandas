import yaml from 'js-yaml';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export type ParsedMarkdown<T extends Record<string, unknown> = Record<string, unknown>> = {
	data: T;
	body: string;
	html: string;
};

export function parseMarkdown<T extends Record<string, unknown> = Record<string, unknown>>(
	raw: string,
): ParsedMarkdown<T> {
	const normalized = raw.replace(/^\uFEFF/, '');
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(normalized);

	if (!match) {
		return {
			data: {} as T,
			body: normalized.trim(),
			html: marked.parse(normalized.trim(), { async: false }) as string,
		};
	}

	const data = (yaml.load(match[1]) ?? {}) as T;
	const body = match[2].trim();
	const html = marked.parse(body, { async: false }) as string;
	return { data, body, html };
}

export function toYamlScalar(value: string | number | boolean) {
	if (typeof value === 'string') {
		if (value === '' || /[:#{}[\],&*?|>!%@`]/.test(value) || value.includes('\n')) {
			return JSON.stringify(value);
		}
		return value;
	}
	return String(value);
}

export function buildMarkdownFile(
	frontmatter: Record<string, unknown>,
	body: string,
): string {
	const lines: string[] = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === undefined || value === null) continue;

		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
				continue;
			}
			if (typeof value[0] === 'object') {
				lines.push(`${key}:`);
				for (const item of value) {
					const obj = item as Record<string, unknown>;
					const keys = Object.keys(obj);
					lines.push(`  - ${keys[0]}: ${toYamlScalar(String(obj[keys[0]]))}`);
					for (const k of keys.slice(1)) {
						lines.push(`    ${k}: ${toYamlScalar(String(obj[k]))}`);
					}
				}
				continue;
			}
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${toYamlScalar(String(item))}`);
			}
			continue;
		}

		if (typeof value === 'object') {
			lines.push(`${key}:`);
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				lines.push(`  ${k}: ${toYamlScalar(String(v))}`);
			}
			continue;
		}

		lines.push(`${key}: ${toYamlScalar(value as string | number | boolean)}`);
	}

	lines.push('---', '', body.trim(), '');
	return lines.join('\n');
}
