-- Faltavam dois formatos que o mercado brasileiro trata como categoria
-- propria, e que a lista da Plannus separa em secoes:
--
--   top_sight          painel elevado em estrutura propria, em avenida.
--   painel_rodoviario  painel de beira de pista, em rodovia.
--
-- Estavam caindo em 'outro' e em 'outdoor'. Formato errado no cadastro vira
-- proposta errada na venda: quem compra top sight nao esta comprando outdoor,
-- e o preco e a audiencia nao sao os mesmos.
--
-- Valor de enum novo nao pode ser usado na mesma transacao que o cria, entao
-- o revinculo vem na migracao seguinte.

alter type face_kind add value if not exists 'top_sight' after 'outdoor';
alter type face_kind add value if not exists 'painel_rodoviario' after 'top_sight';