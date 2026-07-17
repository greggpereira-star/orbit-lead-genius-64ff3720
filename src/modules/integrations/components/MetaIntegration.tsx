import { Link } from "@tanstack/react-router";
import { Share2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetaConnection } from "@/lib/meta-oauth.functions";

export function MetaIntegration({ companyId: _companyId }: { companyId: string }) {
  const getConn = useServerFn(getMetaConnection);
  const { data } = useQuery({
    queryKey: ["meta-connection"],
    queryFn: () => getConn(),
    staleTime: 30_000,
  });
  const connected = !!data?.connection;

  return (
    <Card className="border shadow-none hover:border-primary/20 transition-colors">
      <CardContent className="p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="h-12 w-12 rounded-xl bg-[#1877F2] flex items-center justify-center text-white shadow-lg">
            <Share2 className="h-6 w-6" />
          </div>
          {connected ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Disconnected
            </Badge>
          )}
        </div>

        <h4 className="font-bold text-base mb-1">Meta Lead Ads</h4>
        <p className="text-xs text-muted-foreground mb-6 line-clamp-2">
          Integração oficial via OAuth v25 com Lead Ads API e webhooks em tempo real.
        </p>

        <Button asChild variant={connected ? "outline" : "default"} className="w-full text-xs h-10 font-bold gap-2">
          <Link to="/integrations/meta">
            {connected ? "Gerenciar páginas" : "Conectar com Facebook"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
