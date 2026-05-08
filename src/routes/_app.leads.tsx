import { createFileRoute, Link } from '@tanstack/react-router';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Plus, MoreHorizontal, Chrome, Facebook, Globe } from 'lucide-react';

export const Route = createFileRoute('/_app/leads')({
  component: LeadsPage,
});

const mockLeads = [
  { id: '1', name: 'John Doe', email: 'john@acme.com', status: 'qualified', temperature: 'hot', score: 85, source: 'Google Ads', created_at: '2024-03-20' },
  { id: '2', name: 'Jane Smith', email: 'jane@smith.io', status: 'contacted', temperature: 'warm', score: 65, source: 'Meta Ads', created_at: '2024-03-19' },
  { id: '3', name: 'Bob Johnson', email: 'bob@personal.me', status: 'new', temperature: 'cold', score: 30, source: 'Organic', created_at: '2024-03-18' },
  { id: '4', name: 'Alice Walker', email: 'alice@enterprise.com', status: 'qualified', temperature: 'hot', score: 92, source: 'Direct', created_at: '2024-03-17' },
];

function LeadsPage() {
  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case 'google ads': return <Chrome className="h-3.5 w-3.5 text-blue-500" />;
      case 'meta ads': return <Facebook className="h-3.5 w-3.5 text-blue-600" />;
      default: return <Globe className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm">Manage and track your potential customers with attribution intelligence.</p>
        </div>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Lead
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads by name, email or company..." className="pl-10 h-9" />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Filter className="h-4 w-4" />
          Advanced Filters
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[250px]">Name & Contact</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Temperature</TableHead>
              <TableHead>Lead Score</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
              {mockLeads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50 transition-colors group">
                  <TableCell className="font-medium p-0">
                    <Link to="/leads/$id" params={{ id: lead.id }} className="block p-4">
                      <div className="text-sm">{lead.name}</div>
                      <div className="text-[11px] text-muted-foreground font-normal">{lead.email}</div>
                    </Link>
                  </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getSourceIcon(lead.source)}
                    <span className="text-xs">{lead.source}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize text-[10px] py-0">{lead.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      lead.temperature === 'hot' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 
                      lead.temperature === 'warm' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <span className="capitalize text-xs">{lead.temperature}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 w-24">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          lead.score > 80 ? 'bg-emerald-500' : 
                          lead.score > 50 ? 'bg-primary' : 'bg-amber-500'
                        }`}
                        style={{ width: `${lead.score}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold">{lead.score}</span>
                  </div>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground">{lead.created_at}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
