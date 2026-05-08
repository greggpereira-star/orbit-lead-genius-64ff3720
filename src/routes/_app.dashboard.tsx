 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Users, GitPullRequest, TrendingUp, Target } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/dashboard')({
   component: DashboardPage,
 });
 
 const stats = [
   { title: 'Total Leads', value: '1,284', icon: Users, change: '+12.5%', trend: 'up' },
   { title: 'Deals in Pipeline', value: '$42,500', icon: Target, change: '+8.2%', trend: 'up' },
   { title: 'Conversion Rate', value: '3.2%', icon: TrendingUp, change: '-0.4%', trend: 'down' },
   { title: 'Active Automations', value: '12', icon: GitPullRequest, change: '+2', trend: 'up' },
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
             <p className="text-muted-foreground">Chart will be implemented here (Apache ECharts)</p>
           </CardContent>
         </Card>
         <Card className="col-span-3 border-none shadow-sm">
           <CardHeader>
             <CardTitle>Recent Activity</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-4">
               {[1, 2, 3, 4, 5].map((i) => (
                 <div key={i} className="flex items-center gap-4 text-sm border-b pb-3 last:border-0 last:pb-0">
                   <div className="h-2 w-2 rounded-full bg-primary" />
                   <div className="flex-1">
                     <p className="font-medium">Lead "John Doe" reached "Qualified" stage</p>
                     <p className="text-xs text-muted-foreground">2 hours ago</p>
                   </div>
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }