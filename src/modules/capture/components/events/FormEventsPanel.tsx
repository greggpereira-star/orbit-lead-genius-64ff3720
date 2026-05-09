import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Clock, 
  MousePointer2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter,
  Download,
  Smartphone,
  Laptop,
  Globe,
  ArrowUpRight
} from 'lucide-react';

export function FormEventsPanel({ formId }: { formId: string }) {
  const [filter, setFilter] = useState('');

  const stats = [
    { label: 'Total Eventos', value: '1,284', icon: Activity, color: 'text-primary' },
    { label: 'Inícios', value: '842', icon: PlayCircle, color: 'text-blue-500' },
    { label: 'Submissões', value: '156', icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Taxa Conv.', value: '18.5%', icon: ArrowUpRight, color: 'text-orange-500' }
  ];

  const mockEvents = [
    { id: 1, name: 'form_submitted', time: 'Há 2 min', page: '/imoveis/loteamento-x', mode: 'inline', device: 'Desktop' },
    { id: 2, name: 'field_focused', time: 'Há 5 min', page: '/contato', mode: 'popup', device: 'Mobile' },
    { id: 3, name: 'form_viewed', time: 'Há 8 min', page: '/home', mode: 'floating', device: 'Desktop' },
    { id: 4, name: 'utm_captured', time: 'Há 12 min', page: '/promo-black-friday', mode: 'inline', device: 'Mobile' },
    { id: 5, name: 'sdk_loaded', time: 'Há 15 min', page: '/quem-somos', mode: 'script', device: 'Desktop' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-black mt-1">{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg bg-muted/50 ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tighter">Live Event Stream</CardTitle>
              <CardDescription className="text-xs">Eventos em tempo real capturados pelo SDK LeadFlow.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar evento..." className="pl-9 h-9 w-64 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-2 text-xs font-bold uppercase tracking-wider">
                <Filter className="h-3.5 w-3.5" /> Filtros
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-2 text-xs font-bold uppercase tracking-wider">
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="p-3 text-[10px] font-bold uppercase tracking-widest opacity-60">Evento</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-widest opacity-60">Data/Hora</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-widest opacity-60">Página</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-widest opacity-60">Modo</th>
                  <th className="p-3 text-[10px] font-bold uppercase tracking-widest opacity-60">Device</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mockEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-muted/30 transition-colors cursor-pointer group">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${event.name === 'form_submitted' ? 'bg-green-500' : 'bg-primary'}`} />
                        <span className="font-mono text-xs">{event.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {event.time}
                    </td>
                    <td className="p-3 text-xs truncate max-w-[200px] text-muted-foreground">{event.page}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-widest h-5">{event.mode}</Badge>
                    </td>
                    <td className="p-3">
                      {event.device === 'Desktop' ? <Laptop className="h-4 w-4 text-muted-foreground" /> : <Smartphone className="h-4 w-4 text-muted-foreground" />}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="h-4 w-4" />
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

function PlayCircle({ className }: { className?: string }) {
  return <Activity className={className} />;
}
