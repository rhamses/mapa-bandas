-- mapa-bandas: submissões, imagens (meta) e sessões admin no D1 demos
-- bytes das fotos ficam no R2 demo-bucket (prefixo mapa-bandas/)

CREATE TABLE IF NOT EXISTS mb_submissoes (
  id TEXT PRIMARY KEY,
  markdown TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  saved_at TEXT NOT NULL,
  reviewed_at TEXT,
  credito_publico INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mb_imagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submissao_id TEXT NOT NULL,
  posicao INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  ext TEXT NOT NULL,
  UNIQUE(submissao_id, posicao)
);

CREATE TABLE IF NOT EXISTS mb_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mb_admin_sessions (
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mb_submissoes_saved ON mb_submissoes(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_mb_submissoes_status ON mb_submissoes(status);
CREATE INDEX IF NOT EXISTS idx_mb_imagens_sub ON mb_imagens(submissao_id, posicao);
