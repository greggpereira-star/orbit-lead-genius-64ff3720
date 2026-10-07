import { useCallback, useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Loader2, Check, AlertCircle } from "lucide-react";
import type { QuizDesign } from "../types";
import { getContrastText, withAlpha } from "../lib/color";
import { VIDEO_RESPOSTA, validarEnvioDeVideo } from "../lib/videoResposta";
import { formatarTempo } from "../lib/audio";

/* Sem "revendo": o envio começa sozinho ao parar de gravar, e a revisão
   acontece durante o envio. */
type Fase = "parado" | "pedindo" | "gravando" | "enviando" | "pronto" | "erro" | "negado";

interface Props {
  quizId: string;
  blockId: string;
  sessionId: string;
  design: Pick<QuizDesign, "primary" | "surface" | "text" | "muted" | "radius">;
  onEnviado: (url: string) => void;
}

/**
 * Gravação de resposta em vídeo pelo visitante.
 *
 * Três coisas que decidem se isto funciona na vida real:
 *
 * 1. **A câmera só é pedida no clique.** Pedir ao montar a etapa faz o
 *    navegador abrir a permissão antes de a pessoa saber por quê — e uma
 *    recusa aí é definitiva para a sessão inteira.
 * 2. **A trilha é encerrada em todo caminho de saída**, inclusive ao
 *    desmontar. Sem isso a luz da câmera fica acesa depois que o visitante
 *    avança de etapa, o que ele lê como invasão, com razão.
 * 3. **O limite de tempo para sozinho.** Sem o corte, uma gravação esquecida
 *    estoura os 20MB e o envio falha depois de tudo, que é o pior momento.
 */
export function VideoAnswerRecorder({ quizId, blockId, sessionId, design, onEnviado }: Props) {
  const [fase, setFase] = useState<Fase>("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const duracaoRef = useRef(0);
  /* `onstop` é registrado uma vez e precisa chamar o `enviar` ATUAL. */
  const enviarRef = useRef<() => Promise<void>>(async () => {});

  const encerrarCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Desmontou — por avanço de etapa, por voltar, por fechar: a câmera apaga.
  useEffect(() => encerrarCamera, [encerrarCamera]);

  const gravar = useCallback(async () => {
    setErro(null);
    setFase("pedindo");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        void videoRef.current.play();
      }

      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      pedacosRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data);
      };
      rec.onstop = () => {
        blobRef.current = new Blob(pedacosRef.current, { type: rec.mimeType || "video/webm" });
        encerrarCamera();
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = URL.createObjectURL(blobRef.current);
          videoRef.current.muted = false;
        }
        /* O envio começa SOZINHO ao parar de gravar. Antes era preciso clicar
           em "Enviar": quem gravasse e seguisse em frente perdia o vídeo, e um
           clique a mais é um passo que pode falhar sem ninguém conferir. Dá
           para rever enquanto sobe; refazer troca pelo novo. */
        setFase("enviando");
        void enviarRef.current();
      };
      rec.start();
      setSegundos(0);
      setFase("gravando");
    } catch {
      encerrarCamera();
      setFase("negado");
    }
  }, [encerrarCamera]);

  const parar = useCallback(() => {
    duracaoRef.current = segundos;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, [segundos]);

  // Relógio da gravação, e o corte automático no limite.
  useEffect(() => {
    if (fase !== "gravando") return;
    const id = setInterval(() => {
      setSegundos((s) => {
        const proximo = s + 1;
        if (proximo >= VIDEO_RESPOSTA.segundosMax) {
          duracaoRef.current = proximo;
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        }
        return proximo;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fase]);

  const enviar = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const problema = validarEnvioDeVideo({
      bytes: blob.size,
      mimeType: blob.type,
      segundos: duracaoRef.current,
    });
    if (problema) {
      setErro(problema.motivo);
      setFase("erro");
      return;
    }
    setFase("enviando");
    try {
      const form = new FormData();
      form.append("video", new File([blob], "resposta.webm", { type: blob.type }));
      form.append("quizId", quizId);
      form.append("blockId", blockId);
      form.append("sessionId", sessionId);
      form.append("segundos", String(duracaoRef.current));
      const r = await fetch("/api/public/quiz-video-answer", { method: "POST", body: form });
      const j = (await r.json()) as { url?: string; erro?: string };
      if (!r.ok || !j.url) {
        setErro(j.erro || "Não foi possível enviar.");
        setFase("erro");
        return;
      }
      setFase("pronto");
      onEnviado(j.url);
    } catch {
      setErro("Falha de conexão ao enviar.");
      setFase("erro");
    }
  }, [quizId, blockId, sessionId, onEnviado]);

  enviarRef.current = enviar;

  const refazer = useCallback(() => {
    blobRef.current = null;
    setErro(null);
    setSegundos(0);
    setFase("parado");
    if (videoRef.current) videoRef.current.src = "";
  }, []);

  const botao = (rotulo: string, aoClicar: () => void, Icone: typeof Video, cheio = true) => (
    <button
      type="button"
      onClick={aoClicar}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-transform active:scale-95"
      style={
        cheio
          ? { background: design.primary, color: getContrastText(design.primary) }
          : { background: withAlpha(design.text, 0.08), color: design.text }
      }
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: design.radius,
          background: withAlpha(design.text, 0.06),
          aspectRatio: "3 / 4",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          controls={fase === "enviando" || fase === "pronto" || fase === "erro"}
          className="h-full w-full object-cover"
        />
        {(fase === "parado" || fase === "negado" || fase === "pedindo") && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ color: design.muted }}
          >
            <Video className="h-8 w-8" />
            <p className="text-sm">
              {fase === "pedindo"
                ? "Autorize a câmera no aviso do navegador…"
                : fase === "negado"
                  ? "Sem acesso à câmera. Autorize nas permissões do navegador e tente de novo."
                  : `Grave um vídeo de até ${VIDEO_RESPOSTA.segundosMax} segundos.`}
            </p>
          </div>
        )}
        {fase === "gravando" && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {formatarTempo(segundos)} / {formatarTempo(VIDEO_RESPOSTA.segundosMax)}
          </div>
        )}
      </div>

      {/* Falha de envio como PAINEL, não como linha de texto. O visitante
          gravou, a gravação está na mão dele e pode se perder: tem de ficar
          claro que nada foi enviado e o que fazer. Enquanto está assim, o
          bloco segue sem resposta — e, sendo obrigatório, o botão da etapa
          continua travado, então ninguém avança achando que enviou. */}
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border p-3"
          style={{ borderColor: "#DC262659", background: "#DC26261F", color: design.text }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#DC2626" }} />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">O vídeo não foi enviado.</p>
            <p className="opacity-80">{erro}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(fase === "parado" || fase === "negado") && botao("Gravar", () => void gravar(), Video)}
        {fase === "gravando" && botao("Parar", parar, Square)}
        {fase === "enviando" && (
          <span className="inline-flex items-center gap-2 text-sm" style={{ color: design.muted }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
          </span>
        )}
        {fase === "erro" && (
          <>
            {/* Tenta o MESMO arquivo de novo: a gravação não se perde por causa
                de uma falha de rede. */}
            {botao("Tentar de novo", () => void enviar(), RotateCcw)}
            {botao("Gravar outro", refazer, Video, false)}
          </>
        )}
        {fase === "pronto" && (
          <>
            <span
              className="inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: design.primary }}
            >
              <Check className="h-4 w-4" /> Vídeo enviado
            </span>
            {botao("Regravar", refazer, RotateCcw, false)}
          </>
        )}
      </div>
    </div>
  );
}
