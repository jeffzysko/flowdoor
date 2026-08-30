/**
 * Como cada valor do banco se escreve na tela.
 *
 * No Postgres os valores não têm acento nem espaço — `em_renovacao`,
 * `aguardando_validacao`, `manutencao`. Isso é bom para o banco e péssimo para
 * quem lê: o usuário não escreve assim, e ver "painel_rodoviario" numa
 * proposta parece defeito. Aqui é o único lugar onde a tradução acontece.
 *
 * Valor que a tela ainda não conhece não vira erro nem sai cru com underline:
 * `rotulo()` troca o sublinhado por espaço e devolve legível.
 */

import { FACE_KIND_LABEL } from "./formatos";

const MAPAS: Record<string, Record<string, string>> = {
  face_kind: FACE_KIND_LABEL,

  face_medium: { estatico: "Estático", digital: "Digital (LED)" },
  face_status: { ativa: "Ativa", inativa: "Inativa", manutencao: "Em manutenção" },
  site_status: {
    ativo: "Ativo", inativo: "Inativo",
    manutencao: "Em manutenção", removido: "Removido",
  },
  license_status: {
    vigente: "Vigente", vencida: "Vencida", em_renovacao: "Em renovação",
    dispensada: "Dispensada", desconhecida: "Desconhecida",
  },
  org_kind: { exibidora: "Exibidora", agencia: "Agência", representacao: "Representação" },
  org_status: {
    implantacao: "Em implantação", ativa: "Ativa",
    suspensa: "Suspensa", encerrada: "Encerrada",
  },
  order_status: {
    rascunho: "Rascunho", proposta: "Proposta", aprovado: "Aprovado",
    em_execucao: "Em execução", concluido: "Concluído", cancelado: "Cancelado",
  },
  field_event_kind: {
    aplicacao: "Aplicação", vistoria: "Vistoria", retirada: "Retirada",
    troca: "Troca", manutencao: "Manutenção", registro: "Registro fotográfico",
  },
  field_event_status: {
    pendente: "Pendente", em_andamento: "Em andamento", concluido: "Concluído",
    cancelado: "Cancelado", falhou: "Falhou",
    aguardando_validacao: "Aguardando validação", reprovado: "Reprovado",
  },
  field_photo_kind: {
    antes: "Antes", depois: "Depois", panoramica: "Panorâmica",
    detalhe: "Detalhe", avaria: "Avaria",
  },
  photo_verdict: {
    aprovada: "Aprovada", reprovada: "Reprovada",
    revisao: "Em revisão", pendente: "Pendente",
  },
  check_result: {
    ok: "OK", falhou: "Falhou", incerto: "Incerto",
    desligado: "Desligado", sem_dado: "Sem dado",
  },
  booking_kind: {
    opcao: "Opção", reserva: "Reserva",
    confirmada: "Confirmada", bloqueio: "Bloqueio",
  },
  booking_status: {
    ativa: "Ativa", expirada: "Expirada",
    cancelada: "Cancelada", consumida: "Consumida",
  },
  artwork_status: {
    pendente: "Pendente", enviada: "Enviada",
    aprovada: "Aprovada", reprovada: "Reprovada",
  },
  geo_precision: {
    exata: "Exata", aproximada: "Aproximada", estimada: "Estimada",
    confirmada: "Confirmada pelo campo", manual: "Informada à mão",
    ausente: "Sem coordenada",
  },
  alert_kind: {
    licenca_vencendo: "Licença vencendo", licenca_vencida: "Licença vencida",
    contrato_vencendo: "Contrato vencendo", contrato_vencido: "Contrato vencido",
    aplicacao_atrasada: "Aplicação atrasada", foto_parada: "Foto parada",
  },
  alert_level: { info: "Informação", atencao: "Atenção", urgente: "Urgente" },
  rel_kind: { agencia: "Agência", representacao: "Representação" },
};

/** Último recurso: sublinhado vira espaço e a primeira letra sobe. */
function legivel(v: string) {
  const t = v.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rotulo(tipo: keyof typeof MAPAS | string, valor: string | null | undefined): string {
  if (!valor) return "—";
  return MAPAS[tipo]?.[valor] ?? legivel(valor);
}

/** Pares [valor, rótulo] para montar um seletor sem repetir a lista. */
export function opcoes(tipo: keyof typeof MAPAS | string): [string, string][] {
  return Object.entries(MAPAS[tipo] ?? {});
}
