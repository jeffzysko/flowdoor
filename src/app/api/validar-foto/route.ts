import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { analisarFoto } from "@/lib/domain/validacao";
import { phash64, sha256Hex } from "@/lib/media/hash";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fecha a validação de uma foto de campo.
 *
 * Local, horário, deslocamento e relógio já foram conferidos no banco, no
 * momento do envio. Aqui roda o que precisa sair do Postgres: as duas
 * impressões digitais da imagem e a leitura da IA.
 *
 * A ordem importa. Duplicata é barata de detectar e cara de ignorar, então
 * vem primeiro — arquivo repetido nem chega a virar chamada de IA.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { photoId?: string } | null;
  if (!body?.photoId) {
    return NextResponse.json({ erro: "photoId ausente" }, { status: 400 });
  }

  // O RLS garante que só quem enxerga a foto chega aqui.
  const { data: foto, error } = await supabase
    .from("field_event_photos")
    .select(
      "id, storage_path, check_campaign, check_screen, " +
        "field_events(kind, orders(artwork_path))"
    )
    .eq("id", body.photoId)
    .single();

  if (error || !foto) {
    return NextResponse.json({ erro: "foto não encontrada" }, { status: 404 });
  }

  const f = foto as unknown as {
    id: string;
    storage_path: string;
    check_campaign: string;
    check_screen: string;
    field_events: { kind: string; orders: { artwork_path: string | null } | null } | null;
  };

  // ------------------------------------------------ impressões digitais
  const admin = createAdminClient();
  const { data: arquivo } = await admin.storage
    .from("field-photos")
    .download(f.storage_path);

  let duplicada = false;
  let motivoDuplicata: string | null = null;
  let bytes: Buffer | null = null;

  if (arquivo) {
    bytes = Buffer.from(await arquivo.arrayBuffer());

    const { data: dup } = await supabase.rpc("register_photo_hashes", {
      p_photo: f.id,
      p_sha256: sha256Hex(bytes),
      p_phash: phash64(bytes),
    });

    const d = dup as { check_duplicate?: string; motivo?: string | null } | null;
    duplicada = d?.check_duplicate === "falhou";
    motivoDuplicata = d?.motivo ?? null;
  }

  // ------------------------------------------------------------- a IA
  let campanha: string | null = null;
  let tela: string | null = null;
  let confianca: number | null = null;
  let motivo: string | null = motivoDuplicata;

  const querCampanha = f.check_campaign !== "desligado";
  const querTela = f.check_screen !== "desligado";

  // Arquivo já reprovado por duplicata não merece uma chamada de IA.
  if (!duplicada && bytes && (querCampanha || querTela)) {
    const v = await analisarFoto(
      { data: bytes.toString("base64"), mime: arquivo?.type || "image/jpeg" },
      f.field_events?.orders?.artwork_path ?? null,
      { campanha: querCampanha, tela: querTela }
    );
    campanha = v.campanha;
    tela = v.tela;
    confianca = v.confianca;
    motivo = [v.motivo, v.motivoTela].filter(Boolean).join(" · ") || null;
  }

  const { data: fecho, error: erroFecho } = await supabase.rpc("close_photo_validation", {
    p_photo: f.id,
    p_campanha: campanha,
    p_tela: tela,
    p_confianca: confianca,
    p_motivo: motivo,
  });

  if (erroFecho) {
    return NextResponse.json({ erro: erroFecho.message }, { status: 500 });
  }

  return NextResponse.json(fecho);
}
