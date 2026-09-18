import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Em `astro dev` o adapter Cloudflare roda a API dentro do workerd,
 * onde `node:fs` não grava no disco do projeto. Este plugin espelha
 * as submissões para `data/submissoes/` no processo Node do Vite.
 *
 * @returns {import('vite').Plugin}
 */
export function submissoesDiskMirror() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/submissoes');
	const imagens = path.join(root, 'imagens');

	return {
		name: 'submissoes-disk-mirror',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (req.method !== 'POST' || req.url?.split('?')[0] !== '/__dev/mirror-submissao') {
					next();
					return;
				}

				try {
					const chunks = [];
					for await (const chunk of req) chunks.push(chunk);
					const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
					const { id, markdown, imagem } = payload ?? {};

					if (!id || typeof markdown !== 'string') {
						res.statusCode = 400;
						res.end('payload inválido');
						return;
					}

					await mkdir(imagens, { recursive: true });
					await writeFile(path.join(root, `${id}.md`), markdown, 'utf8');

					if (imagem?.base64 && imagem?.meta?.ext) {
						const bytes = Buffer.from(imagem.base64, 'base64');
						await writeFile(path.join(imagens, `${id}.${imagem.meta.ext}`), bytes);
					}

					res.statusCode = 204;
					res.end();
				} catch (error) {
					console.error('[submissoes-disk-mirror]', error);
					res.statusCode = 500;
					res.end('falha ao espelhar');
				}
			});
		},
	};
}
