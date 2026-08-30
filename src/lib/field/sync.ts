"use client";

import { createClient } from "@/lib/supabase/client";
import {
  dequeue,
  listQueue,
  markFailure,
  type QueueItem,
} from "./queue";

/** Erros que não adiantam repetir: o servidor já decidiu. */
const PERMANENT = [
  "não pertence a você",
  "nao pertence a voce",
  "já concluído",
  "evento nao encontrado",
  "evento não encontrado",
  "ja concluido",
  // Fora de ordem na fila: insistir não resolve, a parada não é essa.
  "nao e a sua parada de agora",
  // Longe demais até para o escape: repetir não aproxima ninguém.
  "longe demais para justificar",
];

const isPermanent = (m: string) =>
  PERMANENT.some((p) => m.toLowerCase().includes(p.toLowerCase()));

async function send(item: QueueItem): Promise<void> {
  const supabase = createClient();

  if (item.action === "start") {
    const { error } = await supabase.rpc("field_start", {
      p_event: item.eventId,
      p_lat: item.payload.lat,
      p_lng: item.payload.lng,
      p_accuracy: item.payload.accuracy ?? null,
      p_idempotency_key: item.key,
      p_override_reason: item.payload.overrideReason ?? null,
    });
    if (error) throw new Error(error.message);
    return;
  }

  // finish: a foto sobe primeiro; só então o registro fecha.
  let path: string | null = null;

  if (item.photo) {
    path = `${item.orgId}/${item.eventId}/${item.key}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("field-photos")
      .upload(path, item.photo, {
        contentType: "image/jpeg",
        upsert: true, // reenvio da fila grava por cima, não duplica
      });
    if (upErr) throw new Error(upErr.message);
  }

  const { data, error } = await supabase.rpc("field_finish", {
    p_event: item.eventId,
    p_photo_path: path,
    p_lat: item.payload.lat,
    p_lng: item.payload.lng,
    p_notes: item.payload.notes ?? null,
    p_idempotency_key: item.key,
    p_client_time: item.payload.clientTime ?? null,
  });
  if (error) throw new Error(error.message);

  // Local e horário o banco já conferiu. Falta a comparação com a arte, que
  // roda no servidor. Se a chamada falhar, a foto fica aguardando validação e
  // a operação resolve na fila de revisão — o registro não se perde.
  const r = data as { photo_id?: string; precisa_ia?: boolean } | null;
  if (r?.photo_id) {
    try {
      await fetch("/api/validar-foto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoId: r.photo_id }),
      });
    } catch {
      /* fica para a revisão manual */
    }
  }
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
  /**
   * Mensagens do servidor para o que não passou. A chegada agora pode ser
   * recusada por distância, e recusa que ninguém mostra vira tela travada
   * sem explicação.
   */
  errors: string[];
}

/** Drena a fila. Seguro chamar quantas vezes quiser. */
export async function flushQueue(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, remaining: (await listQueue()).length, errors: [] };
  }

  const items = await listQueue();
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await send(item);
      await dequeue(item.key);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "falha desconhecida";
      errors.push(message);
      if (isPermanent(message)) {
        // Não adianta insistir: tira da fila e deixa o registro do erro.
        await dequeue(item.key);
      } else {
        await markFailure(item.key, message);
      }
      failed++;
    }
  }

  return { sent, failed, remaining: (await listQueue()).length, errors };
}

/** Liga o dreno ao ciclo de vida: volta de rede, volta de aba, e um tick. */
export function startAutoFlush(onChange?: (r: FlushResult) => void) {
  const run = () => flushQueue().then((r) => onChange?.(r)).catch(() => {});

  run();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  const timer = window.setInterval(run, 30_000);

  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(timer);
  };
}
