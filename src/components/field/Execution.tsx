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
import { dequeue, enqueue, newKey } from "@/lib/field/queue";
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
  /** Escape self-service quando o GPS não fixa. Custa revisão manual. */
  allowOverride?: boolean;
  overrideAfterSeconds?: number;
}

// abaixo disso a foto costuma sair tremida demais para virar comprovante
const NITIDEZ_MINIMA = 0.35;

/** Quanto tempo uma leitura de GPS continua valendo. */
const JANELA_MS = 30_000;

interface Leitura {
  lat: number;
  lng: number;
  accuracy: number;
  t: number;
}

type MotivoEscape = "sinal_fraco" | "obstrucao" | "aparelho_sem_gps" | "outro";

const MOTIVOS: { valor: MotivoEscape; rotulo: string }[] = [
  { valor: "sinal_fraco", rotulo: "O sinal está fraco aqui" },
  { valor: "obstrucao", rotulo: "Prédio ou estrutura na frente" },
  { valor: "aparelho_sem_gps", rotulo: "O aparelho não tem GPS" },
  { valor: "outro", rotulo: "Outro motivo" },
];

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
  allowOverride = true,
  overrideAfterSeconds = 45,
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
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [segundos, setSegundos] = useState(0);
  const [geoNegado, setGeoNegado] = useState(false);
  const [escapeAberto, setEscapeAberto] = useState(false);
  const [motivoEscape, setMotivoEscape] = useState<MotivoEscape | null>(null);
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
   * A posição fica sendo acompanhada enquanto a pessoa se aproxima.
   *
   * O detalhe que importa: a primeira leitura do GPS quase sempre vem com
   * precisão de centenas de metros e melhora sozinha em 15 a 40 segundos.
   * Usar só a leitura mais recente faz a tela recusar quem está no lugar
   * certo — e é isso que vira ligação para o suporte. Por isso guardamos a
   * janela e usamos a MELHOR leitura dela.
   */
  useEffect(() => {
    if (etapa !== "chegada" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoNegado(false);
        setLeituras((antes) => {
          const agora = Date.now();
          const nova: Leitura = {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            t: agora,
          };
          return [...antes, nova].filter((l) => agora - l.t <= JANELA_MS);
        });
      },
      (err) => setGeoNegado(err.code === err.PERMISSION_DENIED),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    const relogio = window.setInterval(() => setSegundos((s) => s + 1), 1000);

    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(relogio);
    };
  }, [etapa]);

  // A melhor da janela, não a última. Leitura velha demais já foi descartada.
  const posicao: Position | null = leituras.length
    ? leituras.reduce((a, b) => (b.accuracy < a.accuracy ? b : a))
    : null;

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

  // O escape só aparece depois que a tela insistiu no GPS por tempo bastante.
  // Oferecer antes disso ensina a pular a trava.
  const podeEscapar =
    travado && allowOverride && segundos >= overrideAfterSeconds;

  // ---------------------------------------------------------- chegada
  /**
   * Não há QR nas estruturas, e manter etiqueta em centenas de pontos na rua
   * não se sustenta. A chegada é provada pela coordenada do aparelho,
   * conferida contra a coordenada cadastrada do ponto.
   */
  const registrarChegada = useCallback(
    async (motivo?: MotivoEscape | null) => {
      setErro(null);
      setAviso(null);
      setOcupado(true);

      const key = newKey();

      try {
        let lat: number | null = null;
        let lng: number | null = null;
        let accuracy: number | null = null;

        try {
          const pos = posicao ?? (await getPosition());
          lat = pos.lat;
          lng = pos.lng;
          accuracy = pos.accuracy;
        } catch (e) {
          setAviso(
            (e instanceof Error ? e.message : "Sem localização.") +
              " A chegada vai sem coordenada — a conferência vai apontar isso."
          );
        }

        await enqueue({
          key,
          action: "start",
          eventId,
          orgId,
          payload: { lat, lng, accuracy, overrideReason: motivo ?? null },
        });

        // flushQueue não lança: a recusa do servidor volta aqui dentro. Sem
        // olhar isto, uma chegada recusada avançaria a tela mesmo assim.
        const r = await flushQueue();
        if (r.errors.length) {
          // Fora da fila em vez de reenvio em segundo plano: a pessoa está
          // ali e vai apertar de novo. Fila fantasma confunde mais do que
          // ajuda.
          await dequeue(key);
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
    },
    [eventId, orgId, router, posicao]
  );

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
      <section className="fd-card mt-8 bg-accent-soft text-center">
        <p className="fd-overline">
          Enviado
        </p>
        <h2 className="fd-h3 mt-2">Foto em conferência.</h2>
        <p className="mt-2 text-ink-2">
          Estamos checando o local, o horário, a peça e se a imagem já foi
          enviada antes. Passando, a próxima parada abre sozinha.
        </p>
        <a
          href="/campo"
          className="fd-btn mt-6"
        >
          Atualizar
        </a>
      </section>
    );
  }

  return (
    <section className="mt-10">
      {erro && (
        <p role="alert" className="fd-alert fd-alert-error mb-4">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="fd-alert fd-alert-warn mb-4">
          {aviso}
        </p>
      )}

      {etapa === "chegada" && (
        <>
          <h2 className="fd-h4">1. Confirme que chegou</h2>
          <p className="mt-1 text-sm text-ink-2">
            A localização do seu aparelho é registrada agora e comparada com a
            coordenada do ponto. É o que sustenta o comprovante do anunciante.
          </p>

          {requireProximity && siteLat != null && siteLng != null && (
            <div
              className={`mt-5 border px-4 py-4 ${
                travado ? "border-line bg-surface" : "border-good/40 bg-good/5"
              }`}
            >
              {geoNegado ? (
                <p className="text-sm text-warn">
                  A localização está bloqueada neste navegador. Libere o acesso
                  para registrar a chegada — sem coordenada não há comprovante.
                </p>
              ) : distancia == null ? (
                <>
                  <p className="tabular-nums text-sm text-ink-2">
                    Procurando o sinal do GPS… {segundos}s
                  </p>
                  <p className="mt-1 text-sm text-ink-3">
                    A primeira leitura costuma levar de 15 a 40 segundos. Fique
                    parado, ao ar livre, com o céu à vista.
                  </p>
                </>
              ) : (
                <>
                  <p className="fd-label">
                    Distância até o ponto
                  </p>
                  <p
                    className={`mt-1 font-mono text-3xl font-bold ${
                      travado ? "text-ink" : "text-good"
                    }`}
                  >
                    {formatDistance(distancia)}
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    {travado
                      ? `Aproxime-se para menos de ${formatDistance(
                          startRadiusM
                        )}. O botão libera sozinho.`
                      : "Você está no ponto. Pode registrar a chegada."}
                  </p>

                  {posicao && (
                    <p className="mt-2 tabular-nums text-xs text-ink-3">
                      Precisão do sinal: ±{Math.round(posicao.accuracy)} m
                      {travado && posicao.accuracy > 60
                        ? ` · ainda melhorando (${segundos}s)`
                        : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            onClick={() => registrarChegada(null)}
            disabled={ocupado || travado}
            className="fd-btn mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ocupado
              ? "Registrando…"
              : travado
                ? "Fora do ponto"
                : "Cheguei no ponto"}
          </button>

          {/*
            O escape existe para o caso real de GPS que não fixa: garagem,
            prédio alto, aparelho velho. Aparece tarde de propósito — oferecer
            cedo ensina a pular a trava — e cobra o preço de ir para revisão
            manual, dito na cara antes de a pessoa escolher.
          */}
          {podeEscapar && !escapeAberto && (
            <button
              onClick={() => setEscapeAberto(true)}
              className="fd-link fd-link-sm mt-4 w-full text-center"
            >
              O GPS não está pegando aqui
            </button>
          )}

          {podeEscapar && escapeAberto && (
            <section className="fd-alert fd-alert-warn mt-4">
              <h3 className="text-sm font-bold">Registrar sem confirmar por GPS</h3>
              <p className="mt-1 text-sm text-ink-2">
                Dá para seguir, mas esta parada não vai ser aprovada sozinha:
                ela vai para conferência manual da operação, e o motivo fica
                registrado no seu nome.
              </p>

              <div className="mt-3 space-y-2">
                {MOTIVOS.map((m) => (
                  <label
                    key={m.valor}
                    className={`flex cursor-pointer items-center gap-3 border px-3 py-3 text-sm ${
                      motivoEscape === m.valor
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="motivo-escape"
                      value={m.valor}
                      checked={motivoEscape === m.valor}
                      onChange={() => setMotivoEscape(m.valor)}
                      className="accent-accent"
                    />
                    {m.rotulo}
                  </label>
                ))}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setEscapeAberto(false);
                    setMotivoEscape(null);
                  }}
                  className="fd-btn fd-btn-ghost flex-1"
                >
                  Voltar a tentar
                </button>
                <button
                  onClick={() => registrarChegada(motivoEscape)}
                  disabled={ocupado || !motivoEscape}
                  className="fd-btn flex-[2]"
                >
                  {ocupado ? "Registrando…" : "Registrar assim mesmo"}
                </button>
              </div>
            </section>
          )}

          <p className="mt-3 text-center text-xs text-ink-3">
            Deixe o GPS ligado e espere alguns segundos ao ar livre para a
            posição ficar precisa.
          </p>
        </>
      )}

      {etapa === "execucao" && (
        <>
          <h2 className="fd-h4">2. Faça o serviço e fotografe</h2>
          <p className="mt-1 text-sm text-ink-2">
            Enquadre a face inteira. A moldura vem na proporção do outdoor, e a
            foto sai carimbada com data, hora, ponto e coordenada.
          </p>
          <button
            onClick={abrirCamera}
            className="fd-btn mt-5 w-full"
          >
            Abrir câmera
          </button>
        </>
      )}

      {etapa === "foto" && (
        <div className="fixed inset-0 z-50 flex flex-col bg-night">
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="w-[92%] rounded-2xl border-[3px] border-cam-frame shadow-[0_0_0_100vmax_var(--fd-cam-scrim)]"
                style={{ aspectRatio: "3.2 / 1" }}
              />
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-28 text-center text-sm text-cam-hint">
              Encaixe a face inteira na moldura
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 bg-night px-6 py-6">
            <button
              onClick={() => {
                stopCamera(streamRef.current);
                streamRef.current = null;
                setEtapa("execucao");
              }}
              className="text-sm font-bold text-cam-hint"
            >
              Cancelar
            </button>
            <button
              onClick={tirarFoto}
              aria-label="Tirar foto"
              className="rounded-full border-4 border-cam-frame bg-cam-frame/20 p-1"
              style={{ height: 72, width: 72 }}
            >
              <span className="block h-full w-full rounded-full bg-cam-frame" />
            </button>
            <span className="w-16" />
          </div>
        </div>
      )}

      {etapa === "revisao" && foto && (
        <>
          <h2 className="fd-h4">3. Confira antes de enviar</h2>

          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Prévia da foto de comprovação"
              className="mt-4 w-full rounded-lg"
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
            <span className="fd-label">
              Observação (opcional)
            </span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="ex.: estrutura com lâmpada queimada no lado direito"
              className="fd-input"
            />
          </label>

          <div className="mt-5 flex gap-3">
            <button
              onClick={abrirCamera}
              className="fd-btn fd-btn-ghost flex-1"
            >
              Refazer
            </button>
            <button
              onClick={concluir}
              disabled={ocupado}
              className="fd-btn flex-[2]"
            >
              {ocupado ? "Enviando…" : "Enviar para conferência"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
