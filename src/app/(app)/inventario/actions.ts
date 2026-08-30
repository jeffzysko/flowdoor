"use server";

import { revalidatePath } from "next/cache";
import { geocodificarPonto, ehCoordenada, referenciaDe } from "@/lib/geo/geocode";
import { FACE_KIND } from "@/lib/domain/formatos";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message?: string };

/**
 * Campo de formulário vazio chega como "" e não como ausente. Sem isto,
 * `z.coerce.number()` transforma "" em 0 e um campo opcional deixado em
 * branco vira erro de validação — que foi exatamente o que acontecia ao
 * cadastrar um ponto sem informar a largura.
 */
const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);
const numero = () => z.preprocess(vazio, z.coerce.number().optional());
const inteiro = () => z.preprocess(vazio, z.coerce.number().int().positive().optional());
const texto = () => z.preprocess(vazio, z.string().optional());

/** Traduz o que o Postgres devolve para algo que se lê na tela. */
function traduzir(err: { message: string; hint?: string | null }): string {
  const m = err.message.toLowerCase();
  if (m.includes("duplicate") || m.includes("unique")) {
    return "Já existe outro registro com esse código nesta empresa.";
  }
  if (m.includes("faces_check")) {
    return "Face digital precisa de duração do loop, do spot e número de inserções.";
  }
  if (m.includes("historico") || m.includes("row-level security")) {
    return err.hint ? `${err.message}. ${err.hint}` : err.message;
  }
  return err.message;
}

/**
 * Resolve a coordenada do ponto quando ninguém digitou uma.
 *
 * O cliente entrega endereço e ponto de referência; latitude e longitude ele
 * nunca tem. Então o sistema busca — e devolve junto o quanto aquilo vale,
 * porque é a precisão que decide se a trava de chegada arma no campo.
 * Coordenada digitada à mão ganha de qualquer busca e não é sobrescrita.
 */
async function resolverCoordenada(v: {
  latitude?: number | null;
  longitude?: number | null;
  address: string;
  district?: string | null;
  city: string;
  state: string;
  referencia?: string | null;
  cruzamento?: string | null;
}) {
  if (v.latitude != null && v.longitude != null) {
    return {
      latitude: v.latitude,
      longitude: v.longitude,
      geo_precision: "manual" as const,
      geo_source: "manual",
      geo_query: null,
      geo_updated_at: new Date().toISOString(),
    };
  }

  const r = await geocodificarPonto({
    endereco: v.address,
    referencia: v.referencia ?? null,
    cruzamento: v.cruzamento ?? null,
    cidade: v.city,
    uf: v.state.toUpperCase(),
  });

  if (!ehCoordenada(r)) {
    // Falha de busca não impede cadastrar o ponto. Sem coordenada ele
    // simplesmente não trava a chegada, e o campo confirma depois.
    return {
      latitude: null,
      longitude: null,
      geo_precision: "ausente" as const,
      geo_source: null,
      geo_query: null,
      geo_updated_at: null,
    };
  }

  return {
    latitude: r.lat,
    longitude: r.lng,
    geo_precision: r.precisao,
    geo_source: r.fonte,
    geo_query: r.consulta,
    geo_updated_at: new Date().toISOString(),
  };
}

// ============================================================ criar ponto
const novoPonto = z.object({
  orgId: z.string().uuid(),
  code: z.string().min(1, "Informe o código do ponto").max(40),
  address: z.string().min(3, "Informe o endereço"),
  district: texto(),
  city: z.string().min(2, "Informe a cidade"),
  state: z.string().length(2, "UF com 2 letras"),
  latitude: numero(),
  longitude: numero(),
  orientation: texto(),
  faceKind: z.enum(FACE_KIND),
  medium: z.enum(["estatico", "digital"]),
  widthM: numero(),
  heightM: numero(),
  licenseExpiresOn: texto(),
  leaseEndsOn: texto(),
});

/**
 * Cria o ponto e a primeira face dele. A face herda o org_id do ponto por
 * trigger — o cliente não escolhe de quem é o inventário.
 */
export async function criarPonto(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = novoPonto.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const geo = await resolverCoordenada(v);

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      org_id: v.orgId,
      code: v.code,
      address: v.address,
      district: v.district ?? null,
      city: v.city,
      state: v.state.toUpperCase(),
      license_expires_on: v.licenseExpiresOn ?? null,
      lease_ends_on: v.leaseEndsOn ?? null,
      ...geo,
    })
    .select("id")
    .single();

  if (siteErr) return { ok: false, message: traduzir(siteErr) };

  const { error: faceErr } = await supabase.from("faces").insert({
    site_id: site.id,
    org_id: v.orgId,
    code: `${v.code}-A`,
    kind: v.faceKind,
    medium: v.medium,
    orientation: v.orientation ?? null,
    width_m: v.widthM ?? null,
    height_m: v.heightM ?? null,
    ...(v.medium === "digital"
      ? { loop_seconds: 60, spot_seconds: 10, slots_total: 6 }
      : {}),
  });

  if (faceErr) {
    return { ok: false, message: "O ponto foi criado, mas a face falhou: " + traduzir(faceErr) };
  }

  revalidatePath("/inventario");
  return { ok: true, message: `Ponto ${v.code} criado com a face ${v.code}-A.` };
}

// ========================================================= atualizar ponto
const pontoEditado = z.object({
  siteId: z.string().uuid(),
  code: z.string().min(1, "Informe o código do ponto").max(40),
  address: z.string().min(3, "Informe o endereço"),
  district: texto(),
  city: z.string().min(2, "Informe a cidade"),
  state: z.string().length(2, "UF com 2 letras"),
  latitude: numero(),
  longitude: numero(),
  status: z.enum(["ativo", "inativo", "manutencao", "removido"]),
  ownerName: texto(),
  ownerContact: texto(),
  leaseEndsOn: texto(),
  leaseMonthlyCost: numero(),
  licenseNumber: texto(),
  licenseExpiresOn: texto(),
  licenseState: z.enum(["vigente", "vencida", "em_renovacao", "dispensada", "desconhecida"]),
  notes: texto(),
});

export async function atualizarPonto(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = pontoEditado.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  // Coordenada digitada vale como decisão de gente e vira 'manual'. Campo
  // vazio na edição não apaga o que a busca já achou: para trocar a
  // coordenada, digite outra; para buscar de novo, use "Buscar coordenada".
  const geo =
    v.latitude != null && v.longitude != null
      ? {
          latitude: v.latitude,
          longitude: v.longitude,
          geo_precision: "manual" as const,
          geo_source: "manual",
          geo_updated_at: new Date().toISOString(),
        }
      : {};

  const { error } = await supabase
    .from("sites")
    .update({
      code: v.code,
      address: v.address,
      district: v.district ?? null,
      city: v.city,
      state: v.state.toUpperCase(),
      ...geo,
      status: v.status,
      owner_name: v.ownerName ?? null,
      owner_contact: v.ownerContact ?? null,
      lease_ends_on: v.leaseEndsOn ?? null,
      lease_monthly_cost: v.leaseMonthlyCost ?? null,
      license_number: v.licenseNumber ?? null,
      license_expires_on: v.licenseExpiresOn ?? null,
      license_state: v.licenseState,
      notes: v.notes ?? null,
    })
    .eq("id", v.siteId);

  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${v.siteId}`);
  return { ok: true, message: "Ponto atualizado." };
}

// ================================================================== faces
const faceBase = {
  code: z.string().min(1, "Informe o código da face").max(40),
  kind: z.enum(FACE_KIND),
  medium: z.enum(["estatico", "digital"]),
  orientation: texto(),
  widthM: numero(),
  heightM: numero(),
  basePrice: numero(),
  loopSeconds: inteiro(),
  spotSeconds: inteiro(),
  slotsTotal: inteiro(),
};

const novaFace = z.object({ siteId: z.string().uuid(), orgId: z.string().uuid(), ...faceBase });
const faceEditada = z.object({
  faceId: z.string().uuid(),
  siteId: z.string().uuid(),
  status: z.enum(["ativa", "inativa", "manutencao"]),
  ...faceBase,
});

/**
 * Face digital sem loop, spot e inserções viola a checagem da tabela. Em vez
 * de deixar o banco recusar com uma mensagem que ninguém entende, o padrão é
 * preenchido aqui e some quando a face volta a ser estática.
 */
function camposDeMidia(v: {
  medium: "estatico" | "digital";
  loopSeconds?: number;
  spotSeconds?: number;
  slotsTotal?: number;
}) {
  if (v.medium !== "digital") {
    return { loop_seconds: null, spot_seconds: null, slots_total: null };
  }
  return {
    loop_seconds: v.loopSeconds ?? 60,
    spot_seconds: v.spotSeconds ?? 10,
    slots_total: v.slotsTotal ?? 6,
  };
}

export async function criarFace(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = novaFace.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("faces").insert({
    site_id: v.siteId,
    org_id: v.orgId,
    code: v.code,
    kind: v.kind,
    medium: v.medium,
    orientation: v.orientation ?? null,
    width_m: v.widthM ?? null,
    height_m: v.heightM ?? null,
    base_price: v.basePrice ?? null,
    ...camposDeMidia(v),
  });

  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${v.siteId}`);
  return { ok: true, message: `Face ${v.code} criada.` };
}

export async function atualizarFace(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = faceEditada.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("faces")
    .update({
      code: v.code,
      kind: v.kind,
      medium: v.medium,
      orientation: v.orientation ?? null,
      width_m: v.widthM ?? null,
      height_m: v.heightM ?? null,
      base_price: v.basePrice ?? null,
      status: v.status,
      ...camposDeMidia(v),
    })
    .eq("id", v.faceId);

  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${v.siteId}`);
  return { ok: true, message: "Face atualizada." };
}

// ============================================================== exclusões
/**
 * A recusa não é decidida aqui: dois gatilhos no banco barram a exclusão de
 * qualquer ponto ou face com histórico. A tela esconde o botão quando sabe
 * que não vai passar, e esta função existe para o caso de a tela estar
 * desatualizada — alguém pode ter vendido a face enquanto a página estava
 * aberta.
 */
export async function excluirFace(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const faceId = String(formData.get("faceId") ?? "");
  const siteId = String(formData.get("siteId") ?? "");
  if (!faceId) return { ok: false, message: "Face não identificada." };

  const supabase = await createClient();
  const { error } = await supabase.from("faces").delete().eq("id", faceId);
  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/${siteId}`);
  return { ok: true, message: "Face excluída." };
}

export async function excluirPonto(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) return { ok: false, message: "Ponto não identificado." };

  const supabase = await createClient();
  const { error } = await supabase.from("sites").delete().eq("id", siteId);
  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath("/inventario");
  return { ok: true, message: "Ponto excluído." };
}

// ==================================================== buscar coordenada
/**
 * Busca a coordenada de um ponto que já existe. É o botão para o caso do
 * ponto que entrou sem coordenada, ou que entrou com uma estimada e ganhou
 * um ponto de referência melhor na descrição depois.
 */
export async function buscarCoordenada(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) return { ok: false, message: "Ponto não informado." };

  const supabase = await createClient();
  const { data: site, error: leituraErr } = await supabase
    .from("sites")
    .select("id, code, address, district, city, state, notes, geo_precision")
    .eq("id", siteId)
    .single();

  if (leituraErr || !site) return { ok: false, message: "Ponto não encontrado." };

  if (site.geo_precision === "confirmada") {
    return {
      ok: false,
      message:
        "Esta coordenada foi confirmada pelas chegadas reais do campo. Buscar de novo seria trocar o que se sabe pelo que se supõe.",
    };
  }

  const r = await geocodificarPonto({
    endereco: site.address,
    // A referência costuma estar nas observações do ponto, que é onde a
    // descrição do cliente cai na importação.
    referencia: referenciaDe(site.notes),
    cidade: site.city,
    uf: site.state,
  });

  if (!ehCoordenada(r)) {
    return {
      ok: false,
      message:
        r.erro === "sem_chave"
          ? "A busca de coordenadas não está configurada neste ambiente."
          : r.erro === "recusado"
            ? "O serviço de mapas recusou a consulta. Confira a chave e as APIs habilitadas."
            : r.erro === "rede"
              ? "Não foi possível falar com o serviço de mapas agora."
              : "Não achei este endereço. Tente completar o endereço ou digitar a coordenada à mão.",
    };
  }

  const { error } = await supabase
    .from("sites")
    .update({
      latitude: r.lat,
      longitude: r.lng,
      geo_precision: r.precisao,
      geo_source: r.fonte,
      geo_query: r.consulta,
      geo_updated_at: new Date().toISOString(),
    })
    .eq("id", siteId);

  if (error) return { ok: false, message: traduzir(error) };

  revalidatePath(`/inventario/${siteId}`);
  return {
    ok: true,
    message:
      r.precisao === "exata"
        ? `Coordenada encontrada em ${r.rotulo ?? r.consulta}. A trava de chegada já vale para este ponto.`
        : `Coordenada aproximada, de ${r.rotulo ?? r.consulta}. A trava de chegada só arma depois que as chegadas do campo confirmarem o lugar.`,
  };
}

// ============================================ buscar coordenadas em lote
const LOTE = 20;      // por chamada, para caber no tempo da função serverless
const PARALELO = 4;   // requisições simultâneas ao Google

/**
 * Busca a coordenada de todos os pontos que ainda não têm uma confiável.
 *
 * É o botão do dia em que uma exibidora nova entra: a lista dela chega sem
 * latitude nenhuma, e clicar ponto a ponto 53 vezes não é trabalho de gente.
 * Roda em lotes porque função serverless tem tempo limitado — a tela diz
 * quantos faltam e o botão pode ser clicado de novo.
 */
export async function buscarCoordenadasEmLote(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { ok: false, message: "Empresa não informada." };

  const supabase = await createClient();

  // Primeiro a limpeza, depois a fila. A busca devolver o MESMO ponto para
  // referências diferentes é chute, não acerto — e chute marcado como exata
  // arma a trava e barra o aplicador no lugar certo. Isso roda ANTES de
  // montar a fila porque é o que devolve esses pontos para ela; rodando só no
  // fim, um inventário todo marcado exata nunca seria revisto.
  const { data: rebaixadosAntes } = await supabase.rpc("demote_duplicate_coordinates", {
    p_org: orgId,
  });

  // 'confirmada' e 'manual' ficam de fora: já valem mais que qualquer busca.
  const { data: pontos, error: leituraErr } = await supabase
    .from("sites")
    .select("id, code, address, city, state, notes")
    .eq("org_id", orgId)
    .in("geo_precision", ["ausente", "estimada"])
    .order("code")
    .limit(LOTE);

  if (leituraErr) return { ok: false, message: traduzir(leituraErr) };
  if (!pontos?.length) {
    revalidatePath("/inventario");
    return {
      ok: true,
      message: Number(rebaixadosAntes ?? 0)
        ? `${rebaixadosAntes} ponto(s) dividiam coordenada com outro e voltaram para a fila. Clique de novo para rebuscar.`
        : "Todos os pontos já têm coordenada.",
    };
  }

  let exatas = 0, aproximadas = 0, falhas = 0;
  let motivoDaFalha: string | null = null;

  const fila = [...pontos];
  async function trabalhador() {
    for (;;) {
      const p = fila.shift();
      if (!p) return;

      const r = await geocodificarPonto({
        endereco: p.address,
        referencia: referenciaDe(p.notes),
        cidade: p.city,
        uf: p.state,
      });

      if (!ehCoordenada(r)) {
        falhas += 1;
        if (r.erro === "sem_chave" || r.erro === "recusado") {
          motivoDaFalha = r.erro;
          fila.length = 0;   // chave errada não melhora nos próximos
        }
        continue;
      }

      await supabase
        .from("sites")
        .update({
          latitude: r.lat,
          longitude: r.lng,
          geo_precision: r.precisao,
          geo_source: r.fonte,
          geo_query: r.consulta,
          geo_updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      if (r.precisao === "exata") exatas += 1;
      else aproximadas += 1;
    }
  }

  await Promise.all(Array.from({ length: PARALELO }, trabalhador));

  if (motivoDaFalha === "sem_chave") {
    return { ok: false, message: "A busca de coordenadas não está configurada neste ambiente." };
  }
  if (motivoDaFalha === "recusado") {
    return {
      ok: false,
      message:
        "O serviço de mapas recusou a consulta. Confira se a chave está válida e se as APIs Geocoding e Places estão habilitadas.",
    };
  }

  const { data: rebaixadosDepois } = await supabase.rpc("demote_duplicate_coordinates", {
    p_org: orgId,
  });

  const { count: faltam } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("geo_precision", ["ausente", "estimada"]);

  revalidatePath("/inventario");

  const duplicados = Number(rebaixadosAntes ?? 0) + Number(rebaixadosDepois ?? 0);
  const partes = [
    `${Math.max(exatas - duplicados, 0)} ponto(s) com coordenada exata — esses já travam a chegada`,
    aproximadas ? `${aproximadas} aproximado(s), que travam depois que o campo confirmar` : null,
    duplicados
      ? `${duplicados} caíram na mesma coordenada de outro ponto e viraram estimados`
      : null,
    falhas ? `${falhas} sem resultado` : null,
    faltam ? `Faltam ${faltam}: clique de novo.` : null,
  ].filter(Boolean);

  return { ok: true, message: partes.join(". ") + "." };
}
