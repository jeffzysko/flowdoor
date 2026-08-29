# Flowdoor

Operação de mídia exterior com prova de execução: do pedido ao comprovante que
o anunciante abre sem login.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions) + TypeScript
- **Tailwind v4**
- **Supabase** — Postgres, Auth, Storage, RLS
- **Vercel** — deploy

## O que muda em relação ao sistema anterior

| Antes | Agora |
|---|---|
| `face` como objeto único | `site` (ponto) → `face` (lado) → `booking` (período vendido) |
| Usuário pertence a UMA empresa | Organizações com tipo, e vínculos entre organizações |
| "Aplicação" só significa colar peça | `field_event` com tipo: aplicação, vistoria, retirada, troca, manutenção |
| Imagens em base64 dentro do Postgres | Supabase Storage com URL assinada |
| Convite com código em claro no banco | Token aleatório, guardado só como hash SHA-256 |
| `claim_first_master` sem trava | `bootstrap_platform_admin()` com advisory lock |
| Sem calendário nem trava de conflito | `EXCLUDE USING gist` impede reserva sobreposta |
| Sem funcionamento offline no campo | Fila em IndexedDB com chave de idempotência |
| Comprovante inexistente | Página pública com snapshot imutável e foto assinada |

## Rodando local

```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev
```

Variáveis:

| Nome | Onde usar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** — usada apenas na página pública de comprovante |
| `NEXT_PUBLIC_SITE_URL` | montagem de links de comprovante e convite |

## Banco

Migrations em `supabase/migrations`. Ver o README de lá.

## Papéis

`owner`, `admin`, `comercial`, `operacao`, `aplicador`, `financeiro`, `leitura`
dentro de cada organização; `platform_admins` acima de todas.

O menu é derivado do papel, mas **a autorização é do RLS** — a interface
esconde, o banco impede.

## Primeira execução

1. Crie um usuário pelo Supabase Auth.
2. Acesse `/plataforma` e confirme "Sou o responsável" (só funciona enquanto
   não houver nenhum admin de plataforma).
3. Crie a primeira exibidora e convide o administrador dela.
