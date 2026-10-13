import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { UserRound } from "lucide-react";

export const Route = createFileRoute("/_app/settings/")({
  component: ProfileSettings,
});

/**
 * O botão "Salvar" desta tela não tinha `onClick`.
 *
 * Nenhum. O autor editava o próprio nome, clicava em Salvar e não acontecia
 * nada — nem gravação, nem erro, nem aviso. Silêncio é a pior resposta
 * possível: sem mensagem nenhuma, a leitura natural é que deu certo, e a
 * pessoa sai acreditando que mudou o nome.
 *
 * Enquanto não existe a gravação, os campos ficam só de leitura e a tela diz
 * de onde vem cada dado. Mostrar sem prometer editar é honesto; oferecer um
 * botão que não faz nada, não.
 */
function ProfileSettings() {
  const { user } = useAuth();

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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={user?.name ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email ?? ""} readOnly />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Editar o perfil por aqui ainda não está disponível. O nome e o e-mail vêm do cadastro
          feito na criação da conta.
        </p>
      </CardContent>
    </Card>
  );
}
