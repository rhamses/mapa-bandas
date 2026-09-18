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

O Worker sobe na conta pessoal (`rhamses.soares@gmail.com`), não na conta da amb1. A `account_id` está travada em `wrangler.jsonc`.

```sh
npm run deploy
```

Produção: https://mapa-bandas.rhamses.workers.dev

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

As bandas publicadas ficam em `src/content/bandas/` como Markdown. As contribuições públicas são gravadas em `data/submissoes/` para revisão.
