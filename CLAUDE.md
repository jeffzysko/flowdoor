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
13. **A fila é trava de banco, não de tela.** `my_next_stop` mostrar uma parada
   por vez não impedia nada: o RLS liberava `assignee_id = auth.uid()` em
   `field_events` (com `position` e `scheduled_for`) e `sites`/`faces` usavam
   `readable_org_ids()`, que ignora papel. Uma chamada ao PostgREST com a
   chave pública do navegador devolvia a rota do mês e o inventário inteiro.
   Agora:

   - `is_field_only(org)` — verdadeiro só para quem é aplicador ou fotógrafo
     **e nada além disso** naquela empresa. Quem acumula papel enxerga pelo
     outro. Falso para quem não é membro, para não quebrar acesso de agência.
   - `my_current_event_id()` — a única parada em que a pessoa pode mexer.
     **Usa a mesma ordenação de `my_next_stop`; as duas têm que concordar.**
   - `my_visible_event_ids()` / `my_visible_face_ids()` — a parada de agora
     mais o que ela já concluiu. O passado não é segredo: ela esteve lá.
   - As policies de `field_events`, `sites`, `faces`, `orders`, `order_items` e
     `field_event_photos` passam por isso. **Mexeu em uma, confira as seis** —
     o endereço da próxima parada vaza por `sites` mesmo com `field_events`
     fechado.
   - `field_start` e `field_finish` são SECURITY DEFINER e **não respeitam
     RLS**. Por isso os dois checam `p_event = my_current_event_id()` por
     dentro. Sem essa guarda, quem descobrisse um uuid abriria a parada de
     fora da fila.
   - Ao testar RLS, lembre que `is_platform_admin()` é o **primeiro ramo de
     toda policy**: testar com o usuário dono da plataforma não prova nada.
14. **A chegada é uma porta, não um carimbo.** Fora do raio, `field_start`
   levanta exceção e a câmera não abre. A margem acompanha a precisão que o
   aparelho informa, **com teto** (`accuracy_margin_max_m`): precisão é um
   número que o cliente manda, e sem teto bastaria declarar 99999 para
   atravessar. `start_radius_m` (250 m) é maior que `location_radius_m`
   (150 m) de propósito — travar é mais caro que apontar, então a trava
   perdoa mais e a conferência da foto continua apertada.
   A conta de distância está em dois lugares, `distancia_m` no Postgres e
   `src/lib/field/geo.ts` no navegador: **precisam bater**, senão a tela
   mostra "chegou" e o servidor recusa.
   `flushQueue` não lança — devolve `errors`. Quem chama **tem** que olhar,
   senão uma chegada recusada avança a tela do mesmo jeito.

   Três válvulas impedem que a trava vire fila de suporte, e nenhuma pode ser
   removida sem repor as outras:

   - **Melhor leitura, não a última.** A primeira leitura do GPS vem com
     precisão de centenas de metros e melhora em 15–40 s. `Execution.tsx`
     guarda a janela de 30 s e usa a leitura de menor `accuracy`. Voltar a
     usar a leitura corrente recusa quem está no lugar certo.
   - **Permissão pedida no `/campo`, não no ponto.** `PermissaoLocalizacao`
     pergunta quando a pessoa abre a fila e, se estiver negada, ensina o
     caminho **no sistema operacional** dela — o conserto é fora do navegador.
   - **Escape self-service com custo.** Depois de `override_after_seconds`
     travada, a pessoa escolhe um motivo e segue. Em troca: a foto nasce com
     `arrival_override`, `close_photo_validation` nunca aprova sozinha, e o
     escape pesa 2 no score. Teto em `override_max_radius_m`: sem coordenada
     nenhuma passa (aparelho que não fixa é o caso legítimo), com coordenada a
     40 km não passa.

   `faces.start_radius_m` conserta um ponto ruim — viaduto, marginal — sem
   afrouxar a empresa inteira. Nulo herda de `field_validation_settings`.
15. **A mesa de revisão é infraestrutura, não tela extra.** Deslocamento
   implausível, janela estourada e chegada por escape **só sabem produzir
   `revisao`**. Sem `/revisao` tratando essa fila, esses três sinais não são
   controle nenhum, e o escape do campo vira passe livre. Se algum dia essa
   tela sair do ar, a decisão certa é desligar `allow_override`, não deixar a
   fila crescer.
   `pending_reviews(org)` monta a lista; `review_photo` decide; recusar exige
   texto, porque ele vira o `rejected_reason` que a pessoa lê na rua.
15. **Inativar é a regra; excluir é a exceção.** `bookings.face_id` e
   `field_events.face_id` são ON DELETE CASCADE — apagar uma face levaria
   junto, em silêncio, as reservas, as aplicações e as fotos, inclusive as de
   um comprovante já entregue ao anunciante, que pararia de abrir. Dois
   gatilhos (`faces_no_delete_if_used`, `sites_no_delete_if_used`) recusam a
   exclusão de qualquer ponto ou face com reserva, aplicação ou item de
   pedido. **A trava é o gatilho, não a tela**: a interface esconde o botão
   quando sabe que vai ser recusado, mas alguém pode vender a face enquanto a
   página está aberta.
16. **Editar pedido é tudo-ou-nada.** `update_order` faz a checagem de colisão
   de TODAS as faces antes de gravar qualquer coisa, e recusa a alteração
   inteira nomeando a face e o pedido que ocupa o lugar. Meio pedido alterado
   seria pior que nenhum. Duas regras que não devem ser afrouxadas:

   - **Face com aplicação `concluido` ou `aguardando_validacao` não sai do
     pedido.** Ela carrega foto, coordenada e horário — tirar destruiria a
     prova que o anunciante já recebeu.
   - **Cancelar não apaga o que aconteceu.** `cancel_order` libera as reservas
     e cancela as aplicações pendentes; a aplicação concluída, a foto e o
     comprovante daquelas faces continuam de pé.

   Quando o período anda, `scheduled_for` de cada aplicação anda o mesmo
   número de dias — senão mudar a campanha de semana deixaria a equipe
   agendada na semana antiga.
17. **Duas tarefas rodam sozinhas, no banco.** `pg_cron` está instalado e os
   jobs vivem em `cron.job` — não em Vercel Cron, que no plano gratuito roda
   uma vez por dia e cobraria uma chamada HTTP para um trabalho que é todo SQL.

   - `flowdoor-avisos`, todo dia às 11h UTC (8h de Brasília): `gerar_alertas()`
   - `flowdoor-expirar-opcoes`, de hora em hora: `expire_stale_holds()`

   **Horário do cron é UTC.** Porto Alegre é UTC−3.

   Sobre a tabela `alerts`: **rodar a tarefa dez vezes no mesmo dia não pode
   encher o painel dez vezes** — o índice único parcial
   `(org_id, kind, entity_id) where resolved_at is null and dismissed_at is null`
   é o que garante isso, e os `insert ... on conflict` dependem dele.
   `resolved_at` é a tarefa percebendo que o problema sumiu (licença renovada);
   `dismissed_at` é uma pessoa decidindo que não importa, e fica registrado
   quem decidiu. **Ninguém escreve na tabela pelo RLS**: não há policy de
   insert nem de update — quem gera é a tarefa e quem dispensa é a RPC.
18. **`create or replace` no Supabase reaplica os default privileges** do schema
   `public`, que dão EXECUTE para `anon` e `authenticated`. Toda vez que uma RPC
   for recriada, refaça os `revoke ... from public, anon`. Conferir depois com
   `get_advisors` ou `has_function_privilege('anon', oid, 'execute')`.
19. **O convite decide o token E o endereço.** O token prova que a pessoa foi
   convidada; ele não decide qual conta entra na empresa. `accept_invitation`
   compara `auth.users.email` da sessão com `invitations.email` e recusa com
   `insufficient_privilege` se forem diferentes. A tela de aceite mostra o
   e-mail como texto fixo, vindo de `invitation_preview(token)` — que roda sem
   sessão porque precisa preencher a tela antes de existir conta, e devolve a
   mesma resposta para token inexistente e token queimado. Sem essa amarra,
   desligar a confirmação de e-mail deixaria entrar conta com endereço nunca
   verificado.
30. **Embed do PostgREST com duas chaves para a mesma tabela precisa
   desempatar.** `field_events` aponta para `profiles` por `assignee_id` **e**
   por `created_by`; pedir `profiles(full_name)` faz o PostgREST recusar a
   consulta inteira com `PGRST201`. A forma certa é
   `profiles!field_events_assignee_id_fkey(full_name)`. `orders` tem o mesmo
   par de chaves e ainda não é consultado assim — vale lembrar antes de
   escrever o próximo embed.
31. **Consulta que falha não pode virar lista vazia.** O detalhe do pedido
   descartava o `error` do Supabase e renderizava zero faces: um pedido
   vendido aparecia como se a venda não tivesse acontecido. Onde a tela mostra
   uma lista que pode ser legitimamente vazia, o erro precisa aparecer
   separado do vazio.
32. **A interface tem uma camada de componentes, e ela é a fonte.** As peças do
   design system v2 vivem em `@layer components` no `globals.css` como classes
   `.fd-*` — botão, card, tabela, tag, alerta, campo, estado vazio, modal —
   construídas só com tokens `--fd-*`. Tela nova compõe essas classes; não
   redesenha a peça com utilitários soltos. Três regras que não se negociam:
   fundo laranja carrega texto **escuro** (4,88:1 contra 2,74:1 do branco), o
   hover do botão **clareia** para `orange-400` (5,75:1), e laranja é **marca,
   não estado** — sucesso é verde, atenção é mostarda, erro é vermelho. A régua
   tipográfica do documento também governa o Tailwind: `--text-sm` é 13px e
   `--text-3xl` é 32px, redefinidos no `@theme`.
33. **Só levanta no hover o que é clicável.** `.fd-card` fica parado;
   `.fd-card.is-interactive` sobe 2px. Card de indicador que não abre nada não
   reage ao ponteiro — movimento sem destino ensina o usuário a ignorar
   movimento.
34. **Toda visão geral termina dizendo o que fazer em seguida.** O bloco
   `ProximaAcao` muda de texto conforme o estado (sem ponto → cadastre; sem
   anunciante → cadastre; sem pedido → venda; com pedido → confira). É o traço
   de UX mais forte do produto; tela de resumo nova mantém o padrão.
35. **Estado vazio tem três partes: o que falta, por quê, e o botão que
   resolve.** Quem não tem permissão para resolver não vê botão — vê a frase
   dizendo a quem pedir.
36. **Geometria não se escreve à mão.** Raio, sombra, padding e espaçamento
   vêm da peça (`.fd-card`, `.fd-list`, `.fd-inset`, `.fd-metrics`) ou dos
   degraus da escala — 4/8/12/16/20/24/32/40/48/64 no espaço, 8/12/16/24/32/
   pílula no raio, xs/sm/md/lg/xl na sombra. Superfície não leva borda: leva
   sombra. Borda no design system é divisor (`border-t`/`border-b`), não
   moldura.
37. **A fonte do produto é Manrope + DM Sans, e só.** Monoespaçada ficou para
   o que é literalmente uma cadeia de caracteres — token, URL, coordenada.
   Código de face e data alinham com `tabular-nums`, que é o que se queria da
   monoespaçada sem trocar a família no meio da frase.
38. **Modal do produto é acessível por contrato.** `role="dialog"`,
   `aria-modal`, Esc fecha, foco preso dentro e devolvido ao gatilho, altura
   em `dvh`. O componente `Modal` já faz isso; tela nova não abre camada
   sobreposta por conta própria.
39. **Formulário tem largura de leitura: 920px.** Campo de 1400px de largura é
   um alvo que o olho perde entre o rótulo e o valor. Tabela e calendário
   podem ocupar a largura toda; formulário, não.
28. **A unidade de venda é a bi-semana.** `faces.base_price` é o valor de
   **14 dias**, não do mês nem do período do pedido — é como mídia exterior se
   vende no Brasil, e a tabela `periods` já modela isso (104 períodos de 14
   dias). Sobra de dias conta como bi-semana inteira. `bi_semanas()` no banco e
   `biSemanas()` em `src/lib/domain/dinheiro.ts` fazem a mesma conta: a tela
   precisa mostrar o total antes de salvar, o banco precisa garantir o total
   salvo. **Se divergirem, a do banco é a que vale.**
29. **O total do pedido é gatilho, não conta na RPC.** Criar, editar e cancelar
   pedido mexem em `order_items` por caminhos diferentes; soma espalhada em
   três lugares diverge cedo ou tarde. `order_items_soma_no_pedido` recalcula
   `orders.total_amount` a cada insert, update e delete, e
   `order_items_preco_padrao` preenche o preço da linha com o valor de tabela
   quando ninguém mandou um — **linha sem preço nunca vira zero.**
27. **A confiança na coordenada é informação de tela, não detalhe técnico.**
   Seis valores de `geo_precision` viram três na interface
   (`src/lib/domain/localizacao.ts`): **confere** (trava a chegada), **parcial**
   (não trava; espera o campo confirmar) e **sem local**. O operador não
   precisa saber se veio do Places ou do Geocoding — precisa saber se pode
   mandar alguém para lá. Coluna "Local" na lista do inventário, bloco
   explicando o porquê no detalhe do ponto, e contagem no topo.
26. **Valor de banco não aparece na tela como está.** No Postgres os valores
   não têm acento nem espaço — `em_renovacao`, `aguardando_validacao`,
   `painel_rodoviario`. `src/lib/domain/rotulos.ts` é o único lugar onde isso
   vira português: `rotulo(tipo, valor)` para exibir, `opcoes(tipo)` para
   montar seletor sem repetir a lista. Valor que a tela ainda não conhece cai
   num último recurso que troca sublinhado por espaço — nunca sai cru.
24. **A busca de lugar recebe a referência, não a descrição.** O Places
   responde alguma coisa para qualquer texto — mandar "Painel rodoviário.
   Rodovia BR 277 - próx. Igreja Rondinha - sentido Curitiba" faz ele
   responder sobre a BR-277 e ignorar a igreja. Foi assim que quatro painéis
   distintos vieram na mesma coordenada e a Balança de São Luiz do Purunã foi
   parar a 20 km de onde deveria. `referenciaDe()` extrai o ponto de
   referência da descrição, e o resultado só vira `exata` se o nome do lugar
   devolvido tiver palavra em comum com o que foi pedido. **Coordenada
   repetida entre pontos diferentes é sinal de palpite**: cai para `estimada`
   e volta para a fila.
25. **Formatos de face num lugar só** (`src/lib/domain/formatos.ts`). A lista
   estava repetida em três telas, e foi assim que top sight e painel
   rodoviário ficaram de fora — o mercado trata os dois como categoria
   própria, com preço e audiência próprios.
23. **Quem responde pela plataforma enxerga todas as empresas.** A lista de
   empresas em `getSessionContext` não vem só de `org_members`: para o
   responsável pela plataforma ela inclui toda `organizations`, marcada com
   `viaPlataforma`. A empresa atual vem do cookie `flowdoor_org`, que é
   preferência de navegação e não credencial — a troca só aceita empresa que
   já está na lista, e quem manda no que pode ser lido é o RLS. Antes disso a
   atual era `list[0]`: quem alcançava duas empresas ficava preso na que o
   banco devolvesse primeiro.
21. **A coordenada é produzida pelo sistema, e carrega o quanto vale.** O
   cliente entrega lista com endereço e ponto de referência; latitude ele não
   tem e nunca vai ter. `sites.geo_precision` diz de onde veio a coordenada, e
   **só `exata`, `confirmada` e `manual` armam a trava de chegada** —
   `field_start` consulta `site_lock_ready()`. Barrar um aplicador com base num
   centroide de rodovia é abrir chamado por erro nosso. Coordenada fraca
   conserta sozinha: `confirm_site_coordinates()` roda todo dia às 08:30 UTC e
   troca a estimativa pelo centro das chegadas reais quando 3 ou mais caem
   agrupadas (escape não conta, espalhamento acima de 60 m não conta).
22. **A busca de lugar vem antes da busca de endereço.** Em mídia exterior a
   descrição é visual — "próx. Metalúrgica Gans", "Balança em São Luiz do
   Purunã". `src/lib/geo/geocode.ts` tenta Places (lugar nomeado), depois
   cruzamento, depois via, e para no primeiro resultado exato. O
   `location_type` do Google decide a precisão: `GEOMETRIC_CENTER` vira
   `aproximada`, nunca `exata` — numa rua curta é razoável, numa BR é inútil,
   e daqui não dá para distinguir.
20. **pgcrypto mora em `extensions`, não em `public`.** `digest()` e
   `gen_random_bytes()` não resolvem dentro de função com
   `set search_path to 'public'` — o erro é `42883 function digest(text,
   unknown) does not exist`, e só aparece em tempo de execução. Foi assim que
   convite ficou quebrado desde o início, criar e aceitar, sem ninguém notar.
   Para hash use `sha256(texto::bytea)`, que é nativo do Postgres e dá o mesmo
   digest; para o resto, qualifique: `extensions.gen_random_bytes(24)`.
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

## E-mail

Sai pelo Resend, configurado como SMTP customizado no Supabase Auth. Remetente
`Flowdoor <nao-responda@flowdoor.com.br>`. DNS na Vercel; conferido em entrega
real: DKIM `pass` com `header.i=@flowdoor.com.br`, SPF `pass` por
`rsend.flowdoor.com.br`, DMARC `pass` alinhado por DKIM, caixa de entrada.

- Os templates de *Authentication → Emails* são editados no painel, não estão
  no repositório. Todos em português — o padrão do Supabase vem em inglês e o
  assunto é fácil de esquecer.
- Em *Authentication → Providers → Email*, "Confirm email" fica **desligado**.
  O convite chega pelo e-mail e o servidor amarra a conta àquele endereço
  (decisão 19), então a confirmação seria redundante. A tela de aceite ainda
  trata o caso de estar ligada: se `signUp` volta sem sessão, ela explica em
  vez de estourar "não autenticado".
- `create_invitation` devolve o token em claro **uma vez**; a ação
  `criarConvite` manda o e-mail pela API HTTP do Resend (`src/lib/email/`) e
  devolve o link do mesmo jeito. Falha de envio nunca invalida o convite: vira
  aviso na tela e o link continua ali para mandar à mão. Sem `RESEND_API_KEY`
  o comportamento é exatamente esse. O link é o segredo. Trate como senha.
- `revoke_invitation(id)` cancela um convite pendente — e-mail digitado errado
  é um link válido por 14 dias, precisa de desligamento. Não apaga a linha:
  convite cancelado é histórico. Convite já aceito não cancela; o caminho é
  desativar o vínculo do membro.
- `/recuperar-senha` precisa estar em `PUBLIC_PREFIXES` no
  `src/lib/supabase/middleware.ts` — quem pede o link não tem sessão.
- `NEXT_PUBLIC_SITE_URL` é `https://www.flowdoor.com.br`. Com `www`, com
  `https`: o apex faz 308 para o `www`, e essa variável monta o link do
  convite, o do comprovante e o `redirectTo` da recuperação.

## Ainda não existe

- Tela do score do aplicador por si só (a RPC `operator_risk(org, user, dias)`
  existe e o score já aparece em cada card da revisão, mas não há uma lista de
  pessoas ordenada por risco).
- Tela de configuração de `field_validation_settings` pela interface. São 18
  colunas hoje, todas ajustáveis só por SQL na mão.
- Liberação de uma parada **pela operação** (o escape hoje é self-service, do
  lado de quem está na rua; não há botão do outro lado).
- Importação de faces por CSV/XLSX.
- Envio de e-mail: `/recuperar-senha`, `/auth/callback` e `/definir-senha`
  estão prontos e **só funcionam com SMTP configurado no Supabase**. Sem ele o
  Supabase usa o remetente de teste, limitado a pouquíssimos e-mails por hora.
  O convite não depende disso: usa tabela e token próprios, e o link é copiado
  à mão até existir um envio nosso.
- Financeiro, bonificação e exclusividade de categoria (tabela existe, regra não).
- Aprovação de arte pelo cliente final.
- Ordem da rota por proximidade de GPS. Hoje a sequência é a que a operação
  montou (`position`); o GPS libera, não escolhe.
- Foto de referência do ponto, para a IA comparar o **entorno** e não só a peça.
  É o que fecha o vetor do GPS falsificado, e o único item da lista que um app
  de localização falsa não vence.
- Auditoria por amostragem: uma fatia das aplicações roteada para uma segunda
  pessoa conferir em campo. Não é software, é processo — e é o único controle
  que muda comportamento em vez de só detectar.

### Achados da auditoria de 30/08 — colunas que o esquema promete e o produto não cumpre

Uma coluna com zero referências no código é uma promessa não cumprida. Estas
são as que a auditoria encontrou, e nenhuma delas é óbvia olhando as telas:

- **Financeiro não existe.** `orders.total_amount` e `faces.base_price` têm
  zero referências. Um pedido não carrega valor. `sites.lease_monthly_cost` é
  só exibido em `/ativos`. Os dois lados da margem estão no banco e não se
  encontram.
- **`org_relationships` tem 0 linhas, 0 telas, 0 referências.** Agência e
  representação foram a decisão nº 2 da arquitetura, o RLS já respeita a
  relação, e não há nenhum jeito de criar uma. Na prática o sistema é
  single-tenant.
- **Reserva com validade nunca foi ligada.** `bookings.kind = 'opcao'` e
  `hold_expires_at` existem; nada cria uma opção.
- ~~Nada roda sozinho.~~ **Fechado.** `pg_cron` instalado, dois jobs ativos.
- **`artwork_approved_at` / `artwork_approved_by` nunca são escritos.** O
  anunciante não aprova a arte em lugar nenhum.
- **`proofs.expires_on` e `revoked_at` não têm tela** — comprovante publicado
  vale para sempre. E `proof_views` grava a visita do anunciante com zero
  referências de leitura: o dado existe e ninguém vê.
- **`category_exclusivity_rules` está vazia e não é consultada por nada.**
- **Disponibilidade fala bi-semana, pedido fala data solta.**
  `/disponibilidade` lê `periods`; `NovoPedido` não menciona período.
- ~~Nenhuma edição.~~ **Fechado.** Ponto e face em `/inventario/[id]`, pedido e
  anunciante em `/operacao/[id]` e `/clientes`.
- **Zero testes.** Sem vitest, jest ou playwright; `package.json` tem `lint` e
  `typecheck` e não tem `test`.

### Risco fora do código

Rastreamento de trabalhador: o sistema grava coordenada, foto, horário,
relógio do aparelho e um score de comportamento, sem aviso, consentimento ou
política de retenção em lugar nenhum. No Brasil isso encosta em monitoramento
de empregado e na LGPD ao mesmo tempo — coordenada e imagem são dado pessoal, e
o score é decisão automatizada sobre uma pessoa. Não é parecer jurídico; é
sinalização para não descobrir na primeira venda para empresa de porte.
