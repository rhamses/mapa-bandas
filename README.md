# Mapa Bandas

Arquivo da história das bandas locais do Brasil. Site em Astro com Tailwind, HTMX, Alpine.js e um mapa fullscreen em Mapbox.

## Stack

- Astro 7 + content collections
- Tailwind CSS 4
- HTMX na busca e no envio de artigos
- Alpine.js no menu e no modal do mapa
- Mapbox GL JS
- RSS, sitemap, robots.txt e Astro Icon
- Cloudflare **Workers** (não Pages)

## Setup

```sh
npm install
cp .env.example .env
```

Crie um **token público** em [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/) e coloque em `PUBLIC_MAPBOX_TOKEN`. Ele precisa começar com `pk.` — tokens `sk.` são secretos e o mapa no browser recusa. Sem o token, o resto do site funciona; a página `/mapa` mostra o aviso de configuração. Reinicie o `npm run dev` depois de salvar o `.env`.

## Deploy (Worker)

O app é um **Cloudflare Worker** na conta amb1 (`account_id` em `wrangler.jsonc`).

Produção: https://mapa-bandas.amb1.workers.dev

### Deploy local

```sh
npm run deploy
```

### Deploy a partir do GitHub (Workers Builds)

1. Abra o Worker [mapa-bandas](https://dash.cloudflare.com/182788b23836a15ba32a69d616ba1db1/workers/services/view/mapa-bandas) → **Settings** → **Builds** → **Connect**.
2. Autorize o GitHub e selecione `rhamses/mapa-bandas`.
3. Configure:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Non-production branch deploy command:** `npx wrangler versions upload`
   - **Production branch:** `main`
4. Em Variables do build, opcional: `PUBLIC_MAPBOX_TOKEN`.

Depois disso, cada push em `main` builda e publica o **Worker** (sem projeto Pages).

### Alternativa: GitHub Actions

O workflow `.github/workflows/ci.yml` valida o build em PRs. Em push para `main`, faz `wrangler deploy` se existirem os secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` = `182788b23836a15ba32a69d616ba1db1`
- `PUBLIC_MAPBOX_TOKEN` (opcional)

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
