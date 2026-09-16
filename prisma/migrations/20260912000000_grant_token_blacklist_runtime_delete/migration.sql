-- Permissao operacional minima para limpeza de tokens JWT revogados expirados.
-- Mantem a proibicao de DELETE fisico em tabelas fiscais/tenant-scoped, liberando
-- apenas a tabela tecnica de seguranca usada pelo scheduler de sessoes.

GRANT DELETE ON TABLE "token_blacklist" TO bcost_app;
