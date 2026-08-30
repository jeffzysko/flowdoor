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
   manutenção, registro. Mesmo GPS, mesma câmera, mesma validação.
9. **Não existe QR nas estruturas.** Nunca existiu, e manter etiqueta em
   centenas de pontos na rua não se sustenta. A prova de presença é a
   **coordenada do aparelho na chegada**, conferida contra a coordenada do
   ponto, mais a foto carimbada. A coluna `field_events.qr_token` continua lá
   mas não é exigida por ninguém.
10. **A foto sai carimbada** com data, hora, ponto e coordenada, desenhadas na
   própria imagem em `src/lib/field/camera.ts`. O carimbo não é prova contra
   fraude — quem prova é o registro do servidor. Ele existe porque a foto sai
   do sistema por WhatsApp e PDF, e fora daqui precisa se explicar sozinha.
11. **Campo é fila, não lista.** O aplicador e o fotógrafo veem UMA parada por
   vez (`my_next_stop`). A próxima só destrava quando a foto da atual é
   validada. Três conferências, ligáveis por empresa em
   `field_validation_settings`: local (raio em metros do ponto), horário
   (janela em minutos) e campanha (IA compara a foto com a arte).
   **Na dúvida a IA responde "incerto", nunca "falhou"** — reflexo, ângulo e
   luz produzem falso negativo com facilidade, e falso negativo prende o
   aplicador na rua. Incerto libera o campo e cai na fila de revisão, a menos
   que `block_on_uncertain` esteja ligado. Reprovação devolve o evento para
   `em_andamento` com o motivo: a pessoa ainda está no ponto e refaz a foto.
12. **Antifraude é camada, não muro.** Coordenada de GPS é falsificável num
   celular com root, e nenhum sinal isolado prova fraude. O que existe tira do
   fraudador as opções baratas, e cada sinal tem um papel definido:

   | sinal | onde | reprova? |
   |---|---|---|
   | `check_duplicate` | `register_photo_hashes` | sim, com SHA-256 igual ou pHash próximo em **outra** estrutura |
   | `check_screen` | IA, em `analisarFoto` | sim, só com confiança ≥ 0,8 |
   | `check_speed` | `field_finish` | **nunca** — só revisão |
   | `check_freshness` | `field_finish` | **nunca** — só revisão |
   | `clock_skew_seconds` | `field_finish` | **nunca** — só entra no score |

   Regras que não devem ser afrouxadas:

   - **Hash é calculado no servidor**, em `src/lib/media/hash.ts`, nunca no
     navegador. Hash que o cliente manda é hash que o fraudador escreve.
   - **O pHash ignora a faixa do carimbo.** A geometria mora em
     `src/lib/field/stamp.ts` e é usada pelos dois lados. Se as contas
     divergirem, o hash passa a medir o carimbo — que é igual em toda foto — e
     tudo vira duplicata.
   - **A duplicata busca do pior caso para o menos grave**: primeiro a mesma
     imagem em outra face (reprova), depois na mesma face em outro pedido
     (revisão). Mesma face e mesmo pedido é refoto legítima depois de reprova.
   - **`sem_dado` nos sinais novos não gera revisão.** A primeira parada do dia
     não tem parada anterior; se `sem_dado` pesasse, toda manhã começaria na
     mesa de revisão. Só `check_location`, `check_time` e `check_campaign`
     tratam `sem_dado` como dúvida.
   - **Velocidade só é calculada acima de 2 km e 60 s.** Abaixo disso o erro do
     GPS explica qualquer número absurdo, e duas faces da mesma estrutura são
     exatamente esse caso.
   - **A hora que vale é sempre `now()` do servidor.** `client_taken_at` existe
     só para medir a diferença.
   - **O score do aplicador não pune e não avisa.** Acima de `watch_threshold`,
     tudo dele cai em `revisao` com `watch_flag = true`, e o campo continua
     andando. Quem está em campo não vê nada — avisar ensina a burlar.
13. **`create or replace` no Supabase reaplica os default privileges** do schema
   `public`, que dão EXECUTE para `anon` e `authenticated`. Toda vez que uma RPC
   for recriada, refaça os `revoke ... from public, anon`. Conferir depois com
   `get_advisors` ou `has_function_privilege('anon', oid, 'execute')`.
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

- Tela de revisão das fotos marcadas como "revisao" (a RPC `review_photo` já
  existe). É onde os sinais antifraude viram trabalho: sem ela, `revisao` é um
  estado que ninguém olha.
- Tela do score do aplicador (a RPC `operator_risk(org, user, dias)` já existe).
- Tela de configuração de `field_validation_settings` pela interface.
- Importação de faces por CSV/XLSX.
- Envio de e-mail de convite (a rota /auth/callback e a tela /definir-senha
  ja existem; falta SMTP configurado no Supabase para o e-mail sair).
- Financeiro, bonificação e exclusividade de categoria (tabela existe, regra não).
- Recuperação de senha pela interface.
- Edição de ponto/face depois de criados.
- Aprovação de arte pelo cliente final.
- Foto de referência do ponto, para a IA comparar o **entorno** e não só a peça.
  É o que fecha o vetor do GPS falsificado, e o único item da lista que um app
  de localização falsa não vence.
- Auditoria por amostragem: uma fatia das aplicações roteada para uma segunda
  pessoa conferir em campo. Não é software, é processo — e é o único controle
  que muda comportamento em vez de só detectar.
