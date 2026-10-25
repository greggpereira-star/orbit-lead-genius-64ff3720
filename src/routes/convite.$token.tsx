import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { consultarConvite } from "@/lib/equipe.functions";
import { ROTULO_DO_PAPEL } from "@/lib/equipe/regras";
import { Logo } from "@/modules/landing/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({ meta: [{ title: "Convite — ALT Leadflow" }, { name: "robots", content: "noindex" }] }),
  component: ConvitePage,
});

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-6">
      <div className="relative z-10 w-full max-w-md space-y-8">
        <Link to="/" className="flex items-center justify-center rounded-lg" aria-label="ALT Leadflow">
          <Logo fundo="claro" tamanho="h-10 w-10" className="text-2xl" />
        </Link>
        {children}
      </div>
    </div>
  );
}

function ConvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const consultarFn = useServerFn(consultarConvite);
  const convite = useQuery({
    queryKey: ["convite", token],
    queryFn: () => consultarFn({ data: { token } }),
    retry: false,
    staleTime: Infinity,
  });

  const [logado, setLogado] = useState<string | null>(null);
  useEffect(() => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => setLogado(data.session?.user?.email ?? null))
      .catch(() => setLogado(null));
  }, []);

  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convite.data?.valido) return;
    if (senha.length < 8) return void toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== repetir) return void toast.error("As senhas não conferem.");
    setEnviando(true);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: convite.data.email,
        password: senha,
        options: {
          data: { full_name: convite.data.email.split("@")[0], invite_token: token },
          emailRedirectTo: window.location.origin + "/verify-email",
        },
      });
      if (error) throw error;
      if (data.session) {
        toast.success("Conta criada. Entrando…");
        void navigate({ to: "/dashboard" });
      } else {
        setEnviado(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setEnviando(false);
    }
  };

  const sair = async () => {
    await getSupabase().auth.signOut();
    setLogado(null);
  };

  if (convite.isLoading)
    return (
      <Moldura>
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Moldura>
    );

  if (convite.isError || !convite.data?.valido)
    return (
      <Moldura>
        <Card className="border-none shadow-xl">
          <CardHeader className="space-y-3 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-xl">Convite inválido ou vencido</CardTitle>
            <CardDescription>
              O link pode ter expirado, já ter sido usado ou ter sido cancelado. Peça um novo convite a
              quem te chamou.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              Já tenho conta: entrar
            </Link>
          </CardFooter>
        </Card>
      </Moldura>
    );

  const c = convite.data;

  if (enviado)
    return (
      <Moldura>
        <Card className="border-none shadow-xl">
          <CardHeader className="space-y-3 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-primary" />
            <CardTitle className="text-xl">Confirme o seu e-mail</CardTitle>
            <CardDescription>
              Enviamos uma mensagem para <b>{c.email}</b>. Abra o link dela e depois entre com o e-mail
              e a senha que você acabou de criar. Você já está na equipe de {c.empresa}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              Ir para o login
            </Link>
          </CardFooter>
        </Card>
      </Moldura>
    );

  return (
    <Moldura>
      <Card className="border-none shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Você foi convidado</CardTitle>
          <CardDescription>
            Entre na equipe de <b>{c.empresa}</b> como{" "}
            <b>{ROTULO_DO_PAPEL[c.papel as keyof typeof ROTULO_DO_PAPEL] ?? c.papel}</b>.
          </CardDescription>
        </CardHeader>

        {logado ? (
          <CardContent className="space-y-3">
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Você está conectado como <b>{logado}</b>. Para aceitar este convite, saia da conta atual e
              crie a nova com o e-mail convidado.
            </p>
            <Button variant="outline" className="w-full" onClick={sair}>
              Sair e continuar
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={cadastrar}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="conv-email">E-mail</Label>
                <Input id="conv-email" type="email" value={c.email} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conv-senha">Crie uma senha</Label>
                <Input
                  id="conv-senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conv-repetir">Repita a senha</Label>
                <Input
                  id="conv-repetir"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="h-11 w-full text-base font-bold" type="submit" disabled={enviando}>
                {enviando ? "Criando conta…" : "Aceitar convite"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </Moldura>
  );
}
