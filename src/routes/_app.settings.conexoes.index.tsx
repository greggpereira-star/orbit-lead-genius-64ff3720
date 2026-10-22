import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plug, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WhatsAppIcon } from "@/design-system/components/WhatsAppIcon";
import { estadoEfetivo } from "@/lib/whatsapp/cloud/conexoes";
import { CartaoDeConexao } from "@/modules/conexoes/components/CartaoDeConexao";
import { useConexoes, useSaudeDasConexoes } from "@/modules/conexoes/hooks";
import {
  FILTRO_VAZIO,
  filtrarConexoes,
  temFiltro,
  type FiltroDeConexoes,
} from "@/modules/conexoes/lib/filtrar";

export const Route = createFileRoute("/_app/settings/conexoes/")({
  component: ListaDeConexoes,
});

function ListaDeConexoes() {
  const navigate = useNavigate();
  const conexoesQ = useConexoes();
  const lista = conexoesQ.data ?? [];
  const saudes = useSaudeDasConexoes(lista);
  const [filtro, setFiltro] = useState<FiltroDeConexoes>(FILTRO_VAZIO);

  const visiveis = filtrarConexoes(lista, filtro, (c) => estadoEfetivo(c, saudes.get(c.id)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Plug className="h-5 w-5" /> Conexões
          </h2>
          <p className="text-sm text-muted-foreground">
            Os números de WhatsApp conectados ao Leadflow: tipo, provedor, estado e saúde.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-10 gap-1.5">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 py-2.5"
              onSelect={() => navigate({ to: "/settings/whatsapp" })}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" /> WhatsApp Business API
              </span>
              <span className="text-xs text-muted-foreground">
                Número oficial, direto com a Meta. Recomendado.
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 py-2.5"
              onSelect={() => navigate({ to: "/whatsapp" })}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp por QR code
              </span>
              <span className="text-xs text-muted-foreground">
                Conexão não oficial, pelo aplicativo do celular.
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={filtro.busca}
            onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
            placeholder="Pesquisar por nome ou número"
            aria-label="Pesquisar conexões"
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={filtro.tipo}
          onValueChange={(v) => setFiltro({ ...filtro, tipo: v as FiltroDeConexoes["tipo"] })}
        >
          <SelectTrigger className="h-10 w-[200px]" aria-label="Filtrar por tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="oficial">WhatsApp Business API</SelectItem>
            <SelectItem value="qr">WhatsApp (QR code)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filtro.estado}
          onValueChange={(v) => setFiltro({ ...filtro, estado: v as FiltroDeConexoes["estado"] })}
        >
          <SelectTrigger className="h-10 w-[180px]" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estados</SelectItem>
            <SelectItem value="conectado">Conectado</SelectItem>
            <SelectItem value="pendente">Pendente na Meta</SelectItem>
            <SelectItem value="desconectado">Desconectado</SelectItem>
          </SelectContent>
        </Select>
        {temFiltro(filtro) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => setFiltro(FILTRO_VAZIO)}
          >
            Limpar
          </Button>
        )}
      </div>

      {conexoesQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {conexoesQ.error && (
        <p className="text-sm text-destructive">Não foi possível carregar as conexões.</p>
      )}

      {!conexoesQ.isLoading && lista.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Nenhuma conexão ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte um número oficial do WhatsApp para atender seus leads por aqui.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/settings/whatsapp" })}>
            Conectar WhatsApp Business API
          </Button>
        </div>
      )}

      {lista.length > 0 && visiveis.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma conexão com esses filtros.
        </p>
      )}

      {visiveis.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {visiveis.map((c) => (
              <li key={`${c.tipo}:${c.id}`}>
                <CartaoDeConexao
                  conexao={c}
                  saude={saudes.get(c.id)}
                  onAbrir={() => navigate({ to: "/settings/conexoes/$id", params: { id: c.id } })}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Mostrando {visiveis.length} de {lista.length}{" "}
            {lista.length === 1 ? "conexão" : "conexões"}.
          </p>
        </>
      )}
    </div>
  );
}
