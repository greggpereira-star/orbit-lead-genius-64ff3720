import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DetalheDaConexao } from "@/modules/conexoes/components/DetalheDaConexao";
import { useConexoes, useSaudeDaConexao, useValidadeDoToken } from "@/modules/conexoes/hooks";

export const Route = createFileRoute("/_app/settings/conexoes/$id")({
  component: PaginaDaConexao,
});

function PaginaDaConexao() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const conexoesQ = useConexoes();
  const conexao = (conexoesQ.data ?? []).find((c) => c.id === id) ?? null;
  const voltar = () => navigate({ to: "/settings/conexoes" });
  // O hook roda sempre (regra dos hooks); só consulta a Meta se a conexão é oficial.
  const saude = useSaudeDaConexao(conexao?.tipo === "oficial" ? conexao.id : null);

  const token = useValidadeDoToken(conexao?.tipo === "oficial" ? conexao.id : null);

  if (conexoesQ.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!conexao)
    return (
      <div className="space-y-3">
        <p className="text-sm">Conexão não encontrada.</p>
        <Button variant="outline" onClick={voltar}>
          Voltar para Conexões
        </Button>
      </div>
    );

  return (
    <DetalheDaConexao
      conexao={conexao}
      saude={saude.saude}
      saudeCarregando={saude.carregando}
      saudeErro={saude.erro}
      validade={token.validade}
      validadeErro={token.erro}
      onVoltar={voltar}
      onAtualizarSaude={saude.atualizar}
    />
  );
}
