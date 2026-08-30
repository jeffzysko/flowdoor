"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { capture, getPosition, startCamera, stopCamera, type Capture } from "@/lib/field/camera";
import { enqueue, newKey } from "@/lib/field/queue";
import { flushQueue } from "@/lib/field/sync";

type Etapa = "chegada" | "execucao" | "foto" | "revisao" | "pronto";

interface Props {
  eventId: string;
  orgId: string;
  status: string;
  startedAt: string | null;
  precisaQr?: boolean;
}

// abaixo disso a foto costuma sair tremida demais para virar comprovante
const NITIDEZ_MINIMA = 0.35;

export function Execution({ eventId, orgId, status, startedAt, precisaQr = true }: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>(
    status === "concluido"
      ? "pronto"
      : status === "aguardando_validacao"
        ? "pronto"
        : startedAt || !precisaQr
          ? "execucao"
          : "chegada"
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [qr, setQr] = useState("");
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
  const registrarChegada = useCallback(async () => {
    setErro(null);
    if (!qr.trim()) {
      setErro("Leia ou digite o código do QR fixado no ponto.");
      return;
    }
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
      } catch (e) {
        // Sem GPS o registro ainda vale — mas o comprovante fica mais fraco,
        // então avisamos em vez de bloquear o trabalho.
        setErro(
          (e instanceof Error ? e.message : "Sem localização.") +
            " A chegada foi registrada sem coordenada."
        );
      }

      await enqueue({
        key: newKey(),
        action: "start",
        eventId,
        orgId,
        payload: { qr: qr.trim(), lat, lng, accuracy },
      });

      await flushQueue();
      setEtapa("execucao");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a chegada.");
    } finally {
      setOcupado(false);
    }
  }, [qr, eventId, orgId, router]);

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
      const shot = await capture(videoRef.current);
      stopCamera(streamRef.current);
      streamRef.current = null;

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(shot.blob));
      setFoto(shot);
      setEtapa("revisao");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao capturar.");
    }
  }, [previewUrl]);

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
        <p
          role="alert"
          className="mb-4 border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn"
        >
          {erro}
        </p>
      )}

      {etapa === "chegada" && (
        <>
          <h2 className="text-lg font-bold">1. Confirme que está no ponto</h2>
          <p className="mt-1 text-sm text-ink-2">
            Leia o QR fixado na estrutura. A coordenada do aparelho é registrada
            junto — é o que sustenta o comprovante.
          </p>

          <QrReader onRead={setQr} onError={setErro} />

          <label className="mt-4 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Código do QR
            </span>
            <input
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="cole ou digite se a leitura falhar"
              className="mt-1 w-full border border-line bg-surface px-3 py-3 font-mono outline-none focus:border-accent"
            />
          </label>

          <button
            onClick={registrarChegada}
            disabled={ocupado}
            className="mt-5 w-full bg-accent px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
          >
            {ocupado ? "Registrando…" : "Registrar chegada"}
          </button>
        </>
      )}

      {etapa === "execucao" && (
        <>
          <h2 className="text-lg font-bold">2. Aplique a peça</h2>
          <p className="mt-1 text-sm text-ink-2">
            Quando terminar, fotografe a face inteira. A moldura já vem na
            proporção do outdoor.
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
              {ocupado ? "Enviando…" : "Concluir aplicação"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Leitura de QR pelo BarcodeDetector nativo quando existe. Sem biblioteca:
 * onde não houver, o campo manual assume — o aplicador nunca fica travado.
 */
function QrReader({
  onRead,
  onError,
}: {
  onRead: (v: string) => void;
  onError: (v: string) => void;
}) {
  const [suportado, setSuportado] = useState(false);
  const [lendo, setLendo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    setSuportado("BarcodeDetector" in globalThis);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      stopCamera(streamRef.current);
    };
  }, []);

  const parar = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setLendo(false);
  }, []);

  const ler = useCallback(async () => {
    setLendo(true);
    try {
      await new Promise((r) => setTimeout(r, 60));
      if (!videoRef.current) return;
      streamRef.current = await startCamera(videoRef.current);

      // @ts-expect-error API nativa ainda sem tipos no lib.dom
      const detector = new BarcodeDetector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found?.length) {
            onRead(String(found[0].rawValue ?? "").trim());
            parar();
            return;
          }
        } catch {
          /* frame ruim, tenta o próximo */
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      onError("Não consegui abrir a câmera para ler o QR. Digite o código.");
      parar();
    }
  }, [onRead, onError, parar]);

  if (!suportado) return null;

  return (
    <div className="mt-4">
      {!lendo ? (
        <button
          onClick={ler}
          className="w-full border border-accent bg-accent-soft px-4 py-3 font-medium text-accent"
        >
          Ler QR com a câmera
        </button>
      ) : (
        <div className="relative overflow-hidden border border-line">
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
          <button
            onClick={parar}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 font-mono text-xs text-white"
          >
            Parar leitura
          </button>
        </div>
      )}
    </div>
  );
}
