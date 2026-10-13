import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { salvarNomeDoPerfil } from "@/core/auth/services/perfilService";
import { AVISO_DO_NOME, LIMITE_DO_NOME, mudou, problemaDoNome } from "@/core/auth/lib/nomeDoPerfil";
import { UserRound, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings/")({
  component: ProfileSettings,
});

/**
 * O botão "Salvar" desta tela não tinha `onClick`. Nenhum.
 *
 * Editava-se o nome, clicava, e não acontecia nada — nem gravação, nem erro,
 * nem aviso. Silêncio é a pior resposta possível: sem mensagem, a leitura
 * natural é que deu certo, e a pessoa saía acreditando que mudou o nome.
 *
 * Agora grava de verdade, em `profiles.full_name` e no metadado da sessão, e
 * chama `refreshContext` para o nome trocar na hora no topo da tela — sem
 * isso, salvar e continuar vendo o nome antigo parece que não salvou.
 *
 * O e-mail segue só de leitura: trocá-lo é mudar a identidade de acesso, com
 * confirmação por e-mail e efeito no login. Não cabe num campo ao lado do
 * nome, e oferecer o campo sem o fluxo seria o mesmo botão mudo de antes.
 */
function ProfileSettings() {
  const { user, refreshContext } = useAuth();
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  /* O nome entra quando o contexto carrega, e não num valor inicial: na
     primeira renderização `user` ainda é nulo, e um `defaultValue` nasceria
     vazio e assim ficaria. */
  useEffect(() => {
    setNome(user?.name ?? "");
  }, [user?.name]);

  const problema = problemaDoNome(nome);
  const podeSalvar = mudou(nome, user?.name) && !salvando;

  async function salvar() {
    if (!user?.id) return;
    setSalvando(true);
    try {
      const salvo = await salvarNomeDoPerfil(user.id, nome);
      setNome(salvo);
      await refreshContext();
      toast.success("Nome atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o nome.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-primary" />
          Seu perfil
        </CardTitle>
        <CardDescription>Seus dados e como o time te vê.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              value={nome}
              maxLength={LIMITE_DO_NOME}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && podeSalvar) void salvar();
              }}
              aria-invalid={!!problema && nome.length > 0}
              aria-describedby={problema ? "aviso-nome" : undefined}
            />
            {problema && nome.length > 0 && (
              <p id="aviso-nome" className="text-xs text-destructive">
                {AVISO_DO_NOME[problema]}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email ?? ""} readOnly />
            <p className="text-xs text-muted-foreground">
              O e-mail é o seu acesso e não muda por aqui.
            </p>
          </div>
        </div>
        <Button onClick={() => void salvar()} disabled={!podeSalvar}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
