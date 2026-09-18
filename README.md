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

O app é um **Cloudflare Worker** na conta pessoal (`account_id` em `wrangler.jsonc`).

Produção: https://mapa-bandas.rhamses.workers.dev

### Deploy local

```sh
npm run deploy
```

### Deploy a partir do GitHub (Workers Builds)

Já conectado no dashboard. Em cada push em `main`:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`

### CI

O workflow `.github/workflows/ci.yml` valida o `npm run build` em PRs.

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
| `/contribuicao` | Submissão pública de artigo (entra em revisão) |
| `/admin` | Painel para aprovar, rejeitar ou excluir contribuições |
| `/rss.xml` | Feed das entradas |
| `/sitemap-index.xml` | Sitemap |

## Admin

Painel em `/admin` (login em `/admin/login`). Novas contribuições ficam **pendentes** até aprovação; só as aprovadas entram no arquivo público. Submissões antigas sem status continuam publicadas.

Credenciais: usuário `admin` (variável `ADMIN_USER`). A senha é validada por `ADMIN_PASSWORD` (secret) ou pelo par `ADMIN_PASSWORD_SALT` + `ADMIN_PASSWORD_HASH` em `wrangler.jsonc`. Sessões ficam no KV `SESSION`.

## Conteúdo

As bandas do acervo inicial ficam em `src/content/bandas/` como Markdown. O site carrega esse acervo **e** as contribuições **aprovadas** em runtime (SSR), então novos envios publicados aparecem sem rebuild.

Cada contribuição pública:

1. Grava um `.md` em `data/submissoes/`
2. Se houver imagem, grava em `data/submissoes/imagens/`
3. Também persiste no KV `SUBMISSOES` (necessário no deploy Cloudflare, onde o disco do Worker não é permanente)
4. Serve imagens em `/media/submissoes/:id`
5. Entra como `pendente` até o admin aprovar em `/admin`
