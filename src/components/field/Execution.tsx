"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  capture,
  getPosition,
  startCamera,
  stopCamera,
  type Capture,
  type Carimbo,
} from "@/lib/field/camera";
import { enqueue, newKey } from "@/lib/field/queue";
import { flushQueue } from "@/lib/field/sync";

type Etapa = "chegada" | "execucao" | "foto" | "revisao" | "pronto";

interface Props {
  eventId: string;
  orgId: string;
  status: string;
  startedAt: string | null;
  precisaChegada?: boolean;
  carimbo?: Omit<Carimbo, "quando" | "lat" | "lng">;
}

// abaixo disso a foto costuma sair tremida demais para virar comprovante
const NITIDEZ_MINIMA = 0.35;

export function Execution({
  eventId,
  orgId,
  status,
  startedAt,
  precisaChegada = true,
  carimbo,
}: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>(
    status === "concluido"
      ? "pronto"
      : status === "aguardando_validacao"
        ? "pronto"
        : startedAt || !precisaChegada
          ? "execucao"
          : "chegada"
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number } | null>(null);
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState<Capture | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ---------------------------------------------------------- chegada
  /**
   * Não há QR nas estruturas, e manter etiqueta em centenas de pontos na rua
   * não se sustenta. A chegada é provada pela coordenada do aparelho,
   * conferida contra a coordenada cadastrada do ponto.
   */
  const registrarChegada = useCallback(async () => {
    setErro(null);
    setAviso(null);
    setOcupado(true);

    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let accuracy: number | null = null;

      try {
        const pos = await getPosition();
        lat = pos.lat;
        lng = pos.lng;
        accuracy = pos.accuracy;
        setPosicao({ lat, lng });
      } catch (e) {
        setAviso(
          (e instanceof Error ? e.message : "Sem localização.") +
            " A chegada foi registrada sem coordenada — a conferência vai apontar isso."
        );
      }

      await enqueue({
        key: newKey(),
        action: "start",
        eventId,
        orgId,
        payload: { lat, lng, accuracy },
      });

      await flushQueue();
      setEtapa("execucao");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a chegada.");
    } finally {
      setOcupado(false);
    }
  }, [eventId, orgId, router]);

  // ------------------------------------------------------------ câmera
  const abrirCamera = useCallback(async () => {
    setErro(null);
    setEtapa("foto");
    try {
      // o vídeo só existe depois que a etapa renderiza
      await new Promise((r) => setTimeout(r, 60));
      if (!videoRef.current) throw new Error("Câmera indisponível.");
      streamRef.current = await startCamera(videoRef.current);
    } catch (e) {
      setErro(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Libere o acesso à câmera para registrar a foto."
          : "Não foi possível abrir a câmera neste aparelho."
      );
      setEtapa("execucao");
    }
  }, []);

  const tirarFoto = useCallback(async () => {
    setErro(null);
    try {
      if (!videoRef.current) return;
      const pos = posicao ?? (await getPosition(6000).catch(() => null));
      const shot = await capture(videoRef.current, {
        ...carimbo,
        quando: new Date(),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      stopCamera(streamRef.current);
      streamRef.current = null;

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(shot.blob));
      setFoto(shot);
      setEtapa("revisao");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao capturar.");
    }
  }, [previewUrl, posicao, carimbo]);

  // ---------------------------------------------------------- conclusão
  const concluir = useCallback(async () => {
    if (!foto) return;
    setErro(null);
    setOcupado(true);

    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await getPosition(8000);
        lat = pos.lat;
        lng = pos.lng;
      } catch {
        /* a foto é o que prova; sem coordenada segue */
      }

      await enqueue({
        key: newKey(),
        action: "finish",
        eventId,
        orgId,
        payload: { lat, lng, notes: notas.trim() || null },
        photo: foto.blob,
        photoName: "comprovacao.jpg",
      });

      await flushQueue();
      setEtapa("pronto");
      // A próxima parada só chega depois que o servidor valida a foto.
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  }, [foto, notas, eventId, orgId, router]);

  // ============================================================ render
  if (etapa === "pronto") {
    return (
      <section className="mt-8 border border-accent bg-accent-soft px-5 py-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
          Enviado
        </p>
        <h2 className="mt-2 text-2xl font-bold">Foto em conferência.</h2>
        <p className="mt-2 text-ink-2">
          Estamos checando o local, o horário e se a peça é da campanha certa.
          Passando, a próxima parada abre sozinha.
        </p>
        <a
          href="/campo"
          className="mt-6 inline-block bg-accent px-6 py-3 font-medium text-white"
        >
          Atualizar
        </a>
      </section>
    );
  }

  return (
    <section className="mt-8">
      {erro && (
        <p role="alert" className="mb-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="mb-4 border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          {aviso}
        </p>
      )}

      {etapa === "chegada" && (
        <>
          <h2 className="text-lg font-bold">1. Confirme que chegou</h2>
          <p className="mt-1 text-sm text-ink-2">
            A localização do seu aparelho é registrada agora e comparada com a
            coordenada do ponto. É o que sustenta o comprovante do anunciante.
          </p>

          <button
            onClick={registrarChegada}
            disabled={ocupado}
            className="mt-6 w-full bg-accent px-4 py-5 text-lg font-medium text-white disabled:opacity-50"
          >
            {ocupado ? "Registrando…" : "Cheguei no ponto"}
          </button>

          <p className="mt-3 text-center text-xs text-ink-3">
            Deixe o GPS ligado e espere alguns segundos ao ar livre para a
            posição ficar precisa.
          </p>
        </>
      )}

      {etapa === "execucao" && (
        <>
          <h2 className="text-lg font-bold">2. Faça o serviço e fotografe</h2>
          <p className="mt-1 text-sm text-ink-2">
            Enquadre a face inteira. A moldura vem na proporção do outdoor, e a
            foto sai carimbada com data, hora, ponto e coordenada.
          </p>
          <button
            onClick={abrirCamera}
            className="mt-5 w-full bg-accent px-4 py-4 text-lg font-medium text-white"
          >
            Abrir câmera
          </button>
        </>
      )}

      {etapa === "foto" && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="w-[92%] border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]"
                style={{ aspectRatio: "3.2 / 1" }}
              />
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-28 text-center font-mono text-xs text-white/90">
              Encaixe a face inteira na moldura
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 bg-black px-6 py-6">
            <button
              onClick={() => {
                stopCamera(streamRef.current);
                streamRef.current = null;
                setEtapa("execucao");
              }}
              className="font-mono text-sm text-white/70"
            >
              Cancelar
            </button>
            <button
              onClick={tirarFoto}
              aria-label="Tirar foto"
              className="h-18 w-18 rounded-full border-4 border-white bg-white/20 p-1"
              style={{ height: 72, width: 72 }}
            >
              <span className="block h-full w-full rounded-full bg-white" />
            </button>
            <span className="w-16" />
          </div>
        </div>
      )}

      {etapa === "revisao" && foto && (
        <>
          <h2 className="text-lg font-bold">3. Confira antes de enviar</h2>

          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Prévia da foto de comprovação"
              className="mt-4 w-full border border-line"
            />
          )}

          <p
            className={`mt-3 font-mono text-xs ${
              foto.sharpness < NITIDEZ_MINIMA ? "text-warn" : "text-good"
            }`}
          >
            {foto.sharpness < NITIDEZ_MINIMA
              ? "A foto ficou pouco nítida. Vale repetir — é ela que o cliente vai ver."
              : "Nitidez boa."}{" "}
            {foto.width}×{foto.height}px
          </p>

          <label className="mt-4 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Observação (opcional)
            </span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="ex.: estrutura com lâmpada queimada no lado direito"
              className="mt-1 w-full border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
            />
          </label>

          <div className="mt-5 flex gap-3">
            <button
              onClick={abrirCamera}
              className="flex-1 border border-line bg-surface px-4 py-4 font-medium"
            >
              Refazer
            </button>
            <button
              onClick={concluir}
              disabled={ocupado}
              className="flex-[2] bg-accent px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
            >
              {ocupado ? "Enviando…" : "Enviar para conferência"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
