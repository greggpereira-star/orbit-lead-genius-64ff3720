import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileDown, 
  FileText, 
  Download,
  Filter,
  Search,
  CheckCircle2,
  Mail,
  Phone,
  User,
  Calendar,
  Share2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function FormSubmissionsPanel({ formId }: { formId: string }) {
  const handleExport = (type: 'csv' | 'pdf') => {
    toast.info(`Preparando exportação \${type.toUpperCase()}...`);
    setTimeout(() => {
      toast.success(`Exportação concluída! O download iniciará em breve.`);
    }, 2000);
  };

  const submissions = [
    { id: '1', name: 'João Silva', email: 'joao@exemplo.com', phone: '(11) 98888-7777', date: '09/05/2026 14:20', status: 'Novo', score: 85 },
    { id: '2', name: 'Maria Oliveira', email: 'maria@test.com', phone: '(21) 97777-6666', date: '09/05/2026 12:45', status: 'Qualificado', score: 92 },
    { id: '3', name: 'Pedro Santos', email: 'pedro@lead.com', phone: '(31) 96666-5555', date: '08/05/2026 18:10', status: 'Novo', score: 45 }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tighter">Gestão de Submissões</h3>
          <p className="text-muted-foreground text-xs">Visualize e exporte os leads capturados neste formulário.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button onClick={() => handleExport('csv')} variant="outline" size="sm" className="gap-2 text-xs font-bold uppercase tracking-wider h-9">
             <FileDown className="h-4 w-4" /> CSV
           </Button>
           <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="gap-2 text-xs font-bold uppercase tracking-wider h-9">
             <FileText className="h-4 w-4" /> PDF
           </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-4">
           <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, email ou telefone..." className="pl-9 h-10 text-xs" />
              </div>
              <Button variant="outline" className="h-10 gap-2 text-xs font-bold uppercase tracking-wider">
                <Filter className="h-4 w-4" /> Filtros
              </Button>
           </div>
        </CardHeader>
        <CardContent>
           <div className="rounded-xl border overflow-hidden">
             <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left">
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-60">Lead</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-60">Contato</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-60">Data</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-60">Status</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-60 text-center">Score</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <User className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-xs">{sub.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" /> {sub.email}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" /> {sub.phone}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                         <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                           <Calendar className="h-3 w-3" /> {sub.date}
                         </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={sub.status === 'Qualificado' ? 'default' : 'secondary'} className="text-[9px] uppercase font-bold tracking-widest h-5">
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xs font-black ${sub.score > 80 ? 'text-green-500' : 'text-orange-500'}`}>{sub.score}</span>
                      </td>
                      <td className="p-4 text-right">
                         <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Share2 className="h-4 w-4" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
