 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { 
   Users, 
   GitPullRequest, 
   TrendingUp, 
   Target, 
   MousePointer2, 
   FormInput, 
   CheckCircle2,
   Globe,
     Search
 } from 'lucide-react';
 import { 
   AreaChart, 
   Area, 
   XAxis, 
   YAxis, 
   CartesianGrid, 
   Tooltip, 
   ResponsiveContainer
 import ReactECharts from 'echarts-for-react';
 } from 'recharts';
 
 export const Route = createFileRoute('/_app/dashboard')({
   component: DashboardPage,
 });
 
 const stats = [
   { title: 'Total Leads', value: '1,284', icon: Users, change: '+12.5%', trend: 'up' },
   { title: 'Deals in Pipeline', value: '$42,500', icon: Target, change: '+8.2%', trend: 'up' },
   { title: 'Conversion Rate', value: '3.2%', icon: TrendingUp, change: '-0.4%', trend: 'down' },
   { title: 'Active Automations', value: '12', icon: GitPullRequest, change: '+2', trend: 'up' },
 ];
 
 const chartData = [
   { name: 'Mon', leads: 40, conversions: 24 },
   { name: 'Tue', leads: 30, conversions: 13 },
   { name: 'Wed', leads: 20, conversions: 98 },
   { name: 'Thu', leads: 27, conversions: 39 },
   { name: 'Fri', leads: 18, conversions: 48 },
   { name: 'Sat', leads: 23, conversions: 38 },
   { name: 'Sun', leads: 34, conversions: 43 },
 ];
 
 const attributionData = [
   { name: 'Google Ads', value: 45, color: '#4285F4' },
   { name: 'Meta Ads', value: 30, color: '#1877F2' },
   { name: 'Organic', value: 15, color: '#34A853' },
   { name: 'Direct', value: 10, color: '#EA4335' },
 ];
 
 const liveEvents = [
   { id: 1, type: 'page_view', text: 'Someone from São Paulo viewed Pricing', time: '2m ago', icon: MousePointer2, color: 'text-blue-500' },
   { id: 2, type: 'form_submission', text: 'New lead "Alice M." via Enterprise Form', time: '5m ago', icon: FormInput, color: 'text-emerald-500' },
   { id: 3, type: 'status_change', text: 'Lead "Bob R." moved to Qualified', time: '12m ago', icon: CheckCircle2, color: 'text-amber-500' },
   { id: 4, type: 'whatsapp', text: 'Message sent to "John Doe"', time: '15m ago', icon: Globe, color: 'text-green-500' },
 ];
 
 function DashboardPage() {
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
         <p className="text-muted-foreground text-sm">Welcome back to your CRM overview.</p>
       </div>
 
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         {stats.map((stat) => (
           <Card key={stat.title} className="border-none shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
               <stat.icon className="h-4 w-4 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{stat.value}</div>
               <p className="text-xs text-muted-foreground mt-1">
                 <span className={stat.trend === 'up' ? 'text-emerald-500 font-medium' : 'text-rose-500 font-medium'}>
                   {stat.change}
                 </span>
                 {' '}from last month
               </p>
             </CardContent>
           </Card>
         ))}
       </div>
 
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
         <Card className="col-span-4 border-none shadow-sm">
           <CardHeader>
             <CardTitle>Lead Performance</CardTitle>
           </CardHeader>
           <CardContent className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                   <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                   </linearGradient>
                  </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--foreground)', opacity: 0.5 }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--foreground)', opacity: 0.5 }} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     itemStyle={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}
                   />
                     <Area type="monotone" dataKey="leads" stroke="var(--primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLeads)" />
                  </AreaChart>
                </ResponsiveContainer>
             </CardContent>
           </Card>
 
           <Card className="col-span-4 border-none shadow-sm">
             <CardHeader>
               <CardTitle>Conversion Funnel Intelligence</CardTitle>
               <CardDescription>Visualizing lead conversion through the sales pipeline</CardDescription>
             </CardHeader>
             <CardContent className="h-[350px]">
               <ReactECharts 
                 option={{
                   tooltip: { trigger: 'item', formatter: '{b} : {c}%' },
                   series: [{
                     name: 'Funnel',
                     type: 'funnel',
                     left: '10%',
                     top: 20,
                     bottom: 20,
                     width: '80%',
                     min: 0,
                     max: 100,
                     minSize: '0%',
                     maxSize: '100%',
                     sort: 'descending',
                     gap: 2,
                     label: { show: true, position: 'inside', color: '#fff' },
                     itemStyle: { borderColor: '#fff', borderWidth: 1 },
                     data: [
                       { value: 100, name: 'Visits' },
                       { value: 60, name: 'Leads' },
                       { value: 40, name: 'Qualified' },
                       { value: 20, name: 'Deals' },
                       { value: 10, name: 'Closed' }
                     ]
                   }]
                 }} 
                 style={{ height: '100%', width: '100%' }}
               />
             </CardContent>
           </Card>
          <Card className="col-span-3 border-none shadow-sm flex flex-col">
           <CardHeader>
             <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Live events from your tracking pixel</CardDescription>
           </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-5">
                {liveEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-4">
                    <div className={`mt-0.5 p-1.5 rounded-lg bg-muted/50 ${event.color}`}>
                      <event.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground/90">{event.text}</p>
                      <p className="text-xs text-muted-foreground">{event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Channel Attribution</h4>
                <div className="space-y-3">
                  {attributionData.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.value}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${item.value}%`, backgroundColor: item.color }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
         </Card>
       </div>
     </div>
   );
 }