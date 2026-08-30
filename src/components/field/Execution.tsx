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
  type Position,
} from "@/lib/field/camera";
import { distanceMeters, formatDistance } from "@/lib/field/geo";
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
  /** Coordenada cadastrada do ponto. Sem ela não há o que travar. */
  siteLat?: number | null;
  siteLng?: number | null;
  /** Ligado, a chegada só é aceita dentro do raio. Quem decide é o servidor. */
  requireProximity?: boolean;
  startRadiusM?: number;
  accuracyMarginMaxM?: number;
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
  siteLat,
  siteLng,
  requireProximity = false,
  startRadiusM = 250,
  accuracyMarginMaxM = 100,
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
  const [posicao, setPosicao] = useState<Position | null>(null);
  const [geoNegado, setGeoNegado] = useState(false);
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

  /**
   * Enquanto a pessoa está se aproximando, a posição fica sendo acompanhada.
   * É o que permite mostrar "faltam 400 m" em vez de deixá-la apertar o botão
   * e levar uma recusa do servidor sem entender por quê.
   */
  useEffect(() => {
    if (etapa !== "chegada" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoNegado(false);
        setPosicao({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
      },
      (err) => setGeoNegado(err.code === err.PERMISSION_DENIED),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [etapa]);

  // A conta é a mesma do servidor. Se divergir, a tela mente.
  const distancia =
    posicao && siteLat != null && siteLng != null
      ? distanceMeters(posicao.lat, posicao.lng, siteLat, siteLng)
      : null;

  // A margem acompanha a imprecisão que o aparelho informa, com o mesmo teto
  // que o banco aplica — senão a tela libera o que o servidor recusa.
  const margem = Math.min(posicao?.accuracy ?? 0, accuracyMarginMaxM);

  const travado =
    requireProximity &&
    siteLat != null &&
    siteLng != null &&
    (distancia == null || distancia - margem > startRadiusM);

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
        const pos = posicao ?? (await getPosition());
        lat = pos.lat;
        lng = pos.lng;
        accuracy = pos.accuracy;
        setPosicao(pos);
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

      // flushQueue não lança: a recusa do servidor volta aqui dentro. Sem
      // olhar isto, uma chegada recusada avançaria a tela mesmo assim.
      const r = await flushQueue();
      if (r.errors.length) {
        setAviso(null);
        setErro(r.errors[0]);
        return;
      }

      setEtapa("execucao");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a chegada.");
    } finally {
      setOcupado(false);
    }
  }, [eventId, orgId, router, posicao]);

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
        payload: {
          lat,
          lng,
          notes: notas.trim() || null,
          clientTime: foto.takenAt.toISOString(),
        },
        photo: foto.blob,
        photoName: "comprovacao.jpg",
      });

      const r = await flushQueue();
      if (r.errors.length) {
        setErro(r.errors[0]);
        return;
      }

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
          Estamos checando o local, o horário, a peça e se a imagem já foi
          enviada antes. Passando, a próxima parada abre sozinha.
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

          {requireProximity && siteLat != null && siteLng != null && (
            <div
              className={`mt-5 border px-4 py-4 ${
                travado
                  ? "border-line bg-surface"
                  : "border-good/40 bg-good/5"
              }`}
            >
              {geoNegado ? (
                <p className="text-sm text-warn">
                  A localização está bloqueada neste navegador. Libere o acesso
                  para registrar a chegada — sem coordenada não há comprovante.
                </p>
              ) : distancia == null ? (
                <p className="font-mono text-sm text-ink-2">
                  Procurando o sinal do GPS…
                </p>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                    Distância até o ponto
                  </p>
                  <p
                    className={`mt-1 font-mono text-2xl font-bold ${
                      travado ? "text-ink" : "text-good"
                    }`}
                  >
                    {formatDistance(distancia)}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    {travado
                      ? `Aproxime-se para menos de ${formatDistance(startRadiusM)} do ponto. O botão libera sozinho.`
                      : "Você está no ponto. Pode registrar a chegada."}
                  </p>
                  {posicao?.accuracy != null && posicao.accuracy > 60 && (
                    <p className="mt-2 font-mono text-xs text-ink-3">
                      Precisão do sinal: ±{Math.round(posicao.accuracy)} m. Ao ar
                      livre e parado por alguns segundos ela melhora.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            onClick={registrarChegada}
            disabled={ocupado || travado}
            className="mt-5 w-full bg-accent px-4 py-5 text-lg font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ocupado
              ? "Registrando…"
              : travado
                ? "Fora do ponto"
                : "Cheguei no ponto"}
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
