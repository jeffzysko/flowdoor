# Migrations

Projeto Supabase `ipcjrlgrxvqdwpofuzuz` (sa-east-1).

| # | Nome | O que traz | Em arquivo? |
|---|------|------------|-------------|
| 1 | `init_core` | profiles, platform_admins, organizations, org_members, org_relationships, funções de contexto, RLS | sim |
| 2 | `inventory` | sites (pontos), faces, periods, bookings com trava de sobreposição | sim |
| 3 | `commercial` | advertisers, orders, order_items, numeração, exclusividade de categoria | sim |
| 4 | `field_and_proof` | field_events, fotos, fila offline, proofs, convites com token hasheado, audit_log | sim |
| 5 | `rpcs` | bootstrap, convites, pedido transacional, field_start / field_finish | **não** |
| 6 | `proof_storage_periods` | publish_proof, get_public_proof, buckets, calendário 2026-2029 | **não** |
| 7 | `harden_grants` | fecha funções internas para anon e trigger functions para todos | **não** |
| 8 | `rename_order_prefix_flowdoor` | prefixo do pedido vira `FLW-` | **não** |

## Pendência conhecida

As migrations 5 a 8 foram aplicadas direto no banco e **ainda não estão em
arquivo**. O arquivo 3 guarda o prefixo antigo `FTD-`, corrigido depois pela 8.

Enquanto isso não for resolvido, **este diretório não reconstrói o banco do
zero**. Para materializar tudo a partir do estado real:

```bash
supabase link --project-ref ipcjrlgrxvqdwpofuzuz
supabase db pull            # gera o arquivo com o schema atual completo
```

Depois disso, apagar os arquivos 1-4 e ficar só com o consolidado, ou manter os
quatro e adicionar os que faltam — o importante é que `supabase db push` num
projeto vazio produza exatamente o schema de produção.
