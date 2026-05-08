import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { LeadFunnelChart } from '@/design-system/components/charts/LeadFunnelChart';

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
