# MCP — Mapa Bandas

Ferramentas MCP para transformar texto ou imagem em ficha de banda, pedir aprovação e gravar no D1.

## Tools

| Tool | Descrição |
|------|-----------|
| `extrair_banda` | Texto e/ou imagem → rascunho + prévia (não salva) |
| `aprovar_banda` | Com confirmação `sim`, grava como `aprovada` e aparece no site |

## Endpoints no site

- Chat humano: [`/agent`](../src/pages/agent.astro)
- API do chat: `POST /api/agent/chat`
- MCP JSON: `POST /api/mcp` (`tools/list`, `tools/call`)

## Fluxo

1. Usuário envia texto ou imagem no chat `/agent`
2. `extrair_banda` monta o rascunho (Workers AI se disponível; senão heurística + geocode Mapbox)
3. Chat mostra prévia e pede confirmação
4. Com **sim**, `aprovar_banda` grava no D1 (`status: aprovada`) e a banda entra no arquivo/mapa

## Workers AI (opcional)

Se o Worker tiver binding `AI`, a extração usa Llama/LLaVA. Sem o binding, cai na heurística + geocode Mapbox.

```jsonc
// wrangler.jsonc
"ai": { "binding": "AI" }
```


```http
POST /api/mcp
Content-Type: application/json

{ "method": "tools/list" }
```

```http
POST /api/mcp
Content-Type: application/json

{
  "method": "tools/call",
  "params": {
    "name": "extrair_banda",
    "arguments": { "texto": "A banda X de Recife, PE, formada em 1993..." }
  }
}
```
