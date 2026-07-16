import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { completeMetaOAuth } from "@/lib/meta-oauth.functions";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "error";

function CallbackPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Concluindo conexão com o Meta…");
  const navigate = useNavigate();
  const complete = useServerFn(completeMetaOAuth);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error_description") ?? params.get("error");
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Parâmetros de retorno ausentes.");
      return;
    }
    complete({ data: { code, state } })
      .then((res) => {
        setStatus("success");
        setMessage(`Conectado como ${res.userName}. ${res.pageCount} página(s) importada(s).`);
        setTimeout(() => navigate({ to: "/integrations/meta" }), 1500);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, [complete, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md w-full bg-card border rounded-lg p-8 text-center space-y-4">
        {status === "loading" && <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />}
        {status === "success" && <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />}
        {status === "error" && <XCircle className="w-10 h-10 mx-auto text-destructive" />}
        <h1 className="text-xl font-semibold">
          {status === "loading" && "Finalizando…"}
          {status === "success" && "Conectado!"}
          {status === "error" && "Falha na conexão"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <Button onClick={() => navigate({ to: "/integrations/meta" })}>Voltar</Button>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/integrations/meta/callback")({
  component: CallbackPage,
});
