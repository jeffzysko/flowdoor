# Migrations

Aplicadas no projeto `zofruzwgxefhogxclywg` (flowtdoor-prod, sa-east-1) nesta ordem:

| # | Nome | O que traz |
|---|------|------------|
| 1 | `init_core` | profiles, platform_admins, organizations, org_members, org_relationships, funcoes de contexto e RLS |
| 2 | `inventory` | sites (pontos), faces, periods (bi-semana), bookings com trava de sobreposicao |
| 3 | `commercial` | advertisers, orders, order_items, numeracao FTD, exclusividade de categoria |
| 4 | `field_and_proof` | field_events, fotos, fila offline, proofs, convites com token hasheado, audit_log |
| 5 | `rpcs` | bootstrap seguro, convites, pedido transacional, field_start / field_finish |
| 6 | `proof_storage_periods` | publish_proof, get_public_proof (anon), buckets de Storage, calendario 2026-2029 |
| 7 | `harden_grants` | fecha as funcoes internas para anon e trigger functions para todo mundo |

Os arquivos `.sql` deste diretorio sao a fonte de verdade. Para um ambiente novo:

```bash
supabase link --project-ref <ref>
supabase db push
```
