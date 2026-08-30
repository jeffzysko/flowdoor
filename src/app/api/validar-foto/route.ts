import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compararComArte } from "@/lib/domain/validacao";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fecha a validação de uma foto de campo.
 *
 * Local e horário já foram conferidos no banco, no momento do envio. Aqui roda
 * só a comparação com a arte — a parte que precisa sair do Postgres.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    photoId?: string;
  } | null;

  if (!body?.photoId) {
    return NextResponse.json({ erro: "photoId ausente" }, { status: 400 });
  }

  // O RLS garante que só quem enxerga a foto chega aqui.
  const { data: foto, error } = await supabase
    .from("field_event_photos")
    .select("id, storage_path, check_campaign, field_events(kind, orders(artwork_path))")
    .eq("id", body.photoId)
    .single();

  if (error || !foto) {
    return NextResponse.json({ erro: "foto não encontrada" }, { status: 404 });
  }

  const f = foto as unknown as {
    id: string;
    storage_path: string;
    check_campaign: string;
    field_events: { kind: string; orders: { artwork_path: string | null } | null } | null;
  };

  let resultado: string = "desligado";
  let confianca: number | null = null;
  let motivo: string | null = null;

  if (f.check_campaign !== "desligado") {
    const v = await compararComArte(
      f.storage_path,
      f.field_events?.orders?.artwork_path ?? null
    );
    resultado = v.resultado;
    confianca = v.confianca;
    motivo = v.motivo;
  }

  const { data: fecho, error: erroFecho } = await supabase.rpc("close_photo_validation", {
    p_photo: f.id,
    p_campanha: resultado,
    p_confianca: confianca,
    p_motivo: motivo,
  });

  if (erroFecho) {
    return NextResponse.json({ erro: erroFecho.message }, { status: 500 });
  }

  return NextResponse.json(fecho);
}
