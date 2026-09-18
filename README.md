# Mapa Bandas

Arquivo da história das bandas locais do Brasil. Site em Astro com Tailwind, HTMX, Alpine.js e um mapa fullscreen em Mapbox.

## Stack

- Astro 7 + content collections
- Tailwind CSS 4
- HTMX na busca e no envio de artigos
- Alpine.js no menu e no modal do mapa
- Mapbox GL JS
- RSS, sitemap, robots.txt e Astro Icon

## Setup

```sh
npm install
cp .env.example .env
```

Crie um **token público** em [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/) e coloque em `PUBLIC_MAPBOX_TOKEN`. Ele precisa começar com `pk.` — tokens `sk.` são secretos e o mapa no browser recusa. Sem o token, o resto do site funciona; a página `/mapa` mostra o aviso de configuração. Reinicie o `npm run dev` depois de salvar o `.env`.

## Deploy

O Worker sobe na conta **amb1** (`account_id` em `wrangler.jsonc`). O Cloudflare Pages do projeto está ligado ao GitHub e, a cada push em `main`, roda:

```sh
npm ci && npm run build && npx wrangler deploy
```

Isso publica o Worker em produção. Também há workflow em `.github/workflows/deploy-cloudflare.yml` (requer secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`).

```sh
npm run deploy
```

Produção: https://mapa-bandas.amb1.workers.dev

```sh
npm run dev
```

## Rotas

| Rota | Função |
| --- | --- |
| `/` | Busca e últimas bandas do arquivo |
| `/mapa` | Mapa do Brasil em tela cheia |
| `/bandas` | Listagem completa |
| `/bandas/[id]` | Artigo da banda |
| `/contribuicao` | Submissão pública de artigo |
| `/rss.xml` | Feed das entradas |
| `/sitemap-index.xml` | Sitemap |

## Conteúdo

As bandas do acervo inicial ficam em `src/content/bandas/` como Markdown. O site carrega esse acervo **e** as contribuições em runtime (SSR), então novos envios aparecem sem rebuild.

Cada contribuição pública:

1. Grava um `.md` em `data/submissoes/`
2. Se houver imagem, grava em `data/submissoes/imagens/`
3. Também persiste no KV `SUBMISSOES` (necessário no deploy Cloudflare, onde o disco do Worker não é permanente)
4. Serve imagens em `/media/submissoes/:id`
