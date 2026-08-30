# Flowdoor — contexto para o agente

**A marca é Flowdoor**, com domínio `flowdoor.com.br`. O nome anterior era
"Flowtdoor" (com T) e sobrevive só em dois lugares que não dá para mexer sem
custo: a pasta local `.../Projects/FLOWTDOOR` e o sistema legado em
`flowtdoor.deau.com.br`. Em código, texto e produto: **Flowdoor**.

Código de pedido: `FLW-<ano>-<sequencial>`.

Reescrita completa do sistema anterior (JS puro + Supabase). Nada foi migrado:
base nova, schema novo.

## Infra

- **Supabase**: projeto `ipcjrlgrxvqdwpofuzuz` (sa-east-1); no painel ainda
  aparece com o nome antigo `flowtdoor-prod` — renomear quando der,
  org `crgrzdwceluktrpijkvi`. Migrations em `supabase/migrations`.
- **Vercel**: time `team_ynhMKT1vhNxivPTtcArWMWBc`.
- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind v4 + `@supabase/ssr`.

## Decisões que não devem ser desfeitas

1. **`site` → `face` → `booking`.** O ponto tem licença, contrato de terreno e
   proprietário. A face tem lado e medida. A reserva é o que se vende. Sem esse
   terceiro nível não existe calendário nem DOOH.
2. **Organizações se relacionam.** `organizations.kind` é exibidora, agência ou
   representação; `org_relationships` liga provider (dono do inventário) a
   consumer. Papel de plataforma vive em `platform_admins`, fora das orgs.
3. **`field_events` é genérico.** Tipo: aplicação, vistoria, retirada, troca,
   manutenção, registro. Mesmo QR, mesmo GPS, mesma câmera.
4. **Imagens em Storage.** Buckets `artworks`, `field-photos`, `avatars`.
   Caminho sempre `<org_id>/...` — a primeira pasta é a fronteira do tenant.
   Nunca base64 em coluna.
5. **RLS é a fronteira, não o filtro do cliente.** As policies usam
   `readable_org_ids()`, `has_org_role()`, `is_org_member()` — SECURITY DEFINER,
   estáveis, com `search_path` fixo. Filtro por `org_id` no front é conveniência.
6. **Operação sensível passa por RPC.** `create_order_with_items`, `field_start`,
   `field_finish`, `publish_proof`, `create_invitation`, `accept_invitation`,
   `bootstrap_platform_admin`, `create_organization`.
7. **Comprovante público** é lido só por `get_public_proof(token)`, a única
   função exposta a `anon`. Devolve snapshot congelado na publicação.
8. **Campo funciona offline.** `src/lib/field/queue.ts` grava em IndexedDB antes
   de qualquer rede; `sync.ts` drena com chave de idempotência. Reenviar não
   duplica — o banco checa `field_sync_log.idempotency_key`.

## Convenções

- UI e mensagens de erro em português, voz ativa, sem jargão de sistema.
- Sem `any`. Tipos do domínio em `src/lib/domain/types.ts`.
- Server Components por padrão; `"use client"` só onde há estado ou API do
  navegador.
- Nada de `alert()`. Erro vira estado e aparece na tela com `role="alert"`.

## Armadilha: instalar dependências

O shell que o agente opera é uma **VM Linux**, não o macOS do Jeff. Rodar
`npm install` de lá baixa binários nativos de Linux e o Mac quebra com
`Cannot find module '../lightningcss.darwin-arm64.node'` — vale para
`lightningcss`, `@tailwindcss/oxide` e `@next/swc`.

Quando precisar instalar a partir da VM:

```bash
npm install --os=darwin --cpu=arm64
```

E limpe `.next` depois, porque o cache guarda artefatos da plataforma errada.
Consequência: com `node_modules` de macOS, `npx next build` **não roda mais na
VM**. Mas `npx tsc --noEmit` roda — TypeScript é JS puro, sem binário nativo.
Use-o como verificação a cada mudança; o build completo fica com o Jeff.

## Sem SMTP

O projeto não tem servidor de e-mail. Por isso convite, recuperação de senha e
magic link **não saem por e-mail**. O caminho que funciona:

- `create_invitation` devolve o token em claro **uma vez**; a tela de equipe
  monta o link `/convite/<token>` para copiar e mandar à mão.
- O link é o segredo. Trate como senha.
- Em *Authentication → Providers → Email*, "Confirm email" precisa estar
  **desligado**, senão quem aceita o convite cria conta e não consegue entrar.

## Ainda não existe

- Importação de faces por CSV/XLSX.
- Envio de e-mail de convite (a rota /auth/callback e a tela /definir-senha
  ja existem; falta SMTP configurado no Supabase para o e-mail sair).
- Financeiro, bonificação e exclusividade de categoria (tabela existe, regra não).
- Recuperação de senha pela interface.
- Edição de ponto/face depois de criados.
- Aprovação de arte pelo cliente final.
