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
  { name: 'Google Ads', value: 4500, color: '#4285F4' },
  { name: 'Meta Ads', value: 3200, color: '#1877F2' },
  { name: 'Organic', value: 2100, color: '#34A853' },
  { name: 'Direct', value: 1200, color: '#EA4335' },
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Marketing Analytics</h1>
        <p className="text-muted-foreground text-sm">Measure ROI and channel performance across your campaigns.</p>
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.92 0.01 255)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'oklch(0.92 0.01 255)', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
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
