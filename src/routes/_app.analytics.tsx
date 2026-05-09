import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, AreaChart, Area, LineChart, Line, PieChart, Pie 
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { LeadFunnelChart } from '@/design-system/components/charts/LeadFunnelChart';
import { SankeyChart } from '@/design-system/components/charts/SankeyChart';
import { 
  TrendingUp, Users, Target, DollarSign, Clock, 
  ArrowUpRight, ArrowDownRight, Filter, Zap 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const kpis = [
  { title: 'Total Leads', value: '2,845', change: '+12.5%', trend: 'up', icon: Users, color: 'text-blue-600' },
  { title: 'Qualified', value: '842', change: '+18.2%', trend: 'up', icon: Target, color: 'text-emerald-600' },
  { title: 'Conv. Rate', value: '29.6%', change: '+2.4%', trend: 'up', icon: TrendingUp, color: 'text-violet-600' },
  { title: 'Avg. CPL', value: 'R$ 42,50', change: '-8.1%', trend: 'down', icon: DollarSign, color: 'text-amber-600' },
  { title: 'CAC', value: 'R$ 1.250', change: '+4.2%', trend: 'up', icon: Zap, color: 'text-rose-600' },
  { title: 'ROAS', value: '4.8x', change: '+0.5x', trend: 'up', icon: TrendingUp, color: 'text-indigo-600' },
  { title: 'Response Time', value: '14m', change: '-5m', trend: 'down', icon: Clock, color: 'text-cyan-600' },
];

const sankeyData = {
   nodes: [
     { name: 'Google Ads' },
     { name: 'Meta Ads' },
     { name: 'Direct' },
     { name: 'Leads' },
     { name: 'Qualified' },
     { name: 'Opportunity' },
     { name: 'Closed Won' }
   ],
   links: [
     { source: 'Google Ads', target: 'Leads', value: 120 },
     { source: 'Meta Ads', target: 'Leads', value: 80 },
     { source: 'Direct', target: 'Leads', value: 40 },
     { source: 'Leads', target: 'Qualified', value: 150 },
     { source: 'Qualified', target: 'Opportunity', value: 60 },
     { source: 'Opportunity', target: 'Closed Won', value: 30 }
   ]
 };
 

export const Route = createFileRoute('/_app/analytics')({
  component: AnalyticsPage,
});

const channelData = [
  { name: 'Google Ads', value: 4500, color: 'var(--primary)' },
  { name: 'Meta Ads', value: 3200, color: 'oklch(0.68 0.19 145)' },
  { name: 'Organic', value: 2100, color: 'oklch(0.65 0.23 300)' },
  { name: 'Direct', value: 1200, color: 'oklch(0.59 0.23 27)' },
];

const funnelData = [
  { value: 100, name: 'Visits' },
  { value: 80, name: 'Leads' },
  { value: 60, name: 'Qualified' },
  { value: 40, name: 'Negotiation' },
  { value: 20, name: 'Won' }
];

function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Intelligence Dashboard</h1>
          <p className="text-muted-foreground text-sm font-medium">Enterprise performance metrics and real-time attribution.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 gap-1.5 px-3 font-semibold border-primary/20 bg-primary/5 text-primary">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Live Data
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                  kpi.trend === 'up' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                )}>
                  {kpi.trend === 'up' ? <ArrowUpRight className="h-2 w-2" /> : <ArrowDownRight className="h-2 w-2" />}
                  {kpi.change}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{kpi.title}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
            <CardDescription>Conversion rates through each stage of the pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadFunnelChart data={funnelData} />
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
            <CardDescription>Highest ROI campaigns this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { name: 'Search_Enterprise_US', roi: '4.2x', spend: '$1.2k' },
                { name: 'Remarketing_FB_LATAM', roi: '3.8x', spend: '$800' },
                { name: 'LinkedIn_DecisionMakers', roi: '2.5x', spend: '$2.5k' },
              ].map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Spend: {c.spend}</p>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100">{c.roi} ROI</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

         <Card className="lg:col-span-3 border-none shadow-sm">
           <CardHeader>
             <CardTitle>Lead Attribution Flow</CardTitle>
             <CardDescription>Visualizing how leads move from initial touchpoint to final conversion</CardDescription>
           </CardHeader>
           <CardContent>
             <SankeyChart data={sankeyData} />
           </CardContent>
         </Card>
 
         <Card className="lg:col-span-3 border-none shadow-sm">
          <CardHeader>
            <CardTitle>Conversions by Channel</CardTitle>
            <CardDescription>Estimated revenue based on attribution model</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--foreground)', fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--foreground)', fontWeight: 600 }} />
                <Tooltip 
                  cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.2)' }}
                  itemStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                  labelStyle={{ color: 'var(--foreground)', fontWeight: 700 }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
