import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { Users, TrendingUp, Target, Zap } from 'lucide-react';

const data = [
  { time: '09:00', leads: 12, value: 4500 },
  { time: '10:00', leads: 18, value: 6800 },
  { time: '11:00', leads: 15, value: 5200 },
  { time: '12:00', leads: 25, value: 9100 },
  { time: '13:00', leads: 32, value: 12400 },
  { time: '14:00', leads: 28, value: 10200 },
  { time: '15:00', leads: 40, value: 15600 },
];

const channelData = [
  { name: 'Google', value: 45, color: '#4285F4' },
  { name: 'Meta', value: 30, color: '#1877F2' },
  { name: 'Direct', value: 15, color: '#34A853' },
  { name: 'Organic', value: 10, color: '#EA4335' },
];

export function TVDashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 overflow-hidden">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-white uppercase italic">Real-Time Revenue Command</h1>
          <p className="text-zinc-500 font-mono tracking-widest uppercase">System Status: Active • Monitoring 4 Channels</p>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="text-zinc-500 uppercase text-xs font-bold tracking-widest">Global Conversions</p>
            <p className="text-4xl font-black text-emerald-500 tracking-tighter">1,284</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 uppercase text-xs font-bold tracking-widest">Revenue Forecast</p>
            <p className="text-4xl font-black text-white tracking-tighter">$2.4M</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-8 mb-8">
        {[
          { label: 'Current CPA', value: '$14.20', icon: Target, trend: '-12%' },
          { label: 'Avg Lead Score', value: '84/100', icon: Zap, trend: '+5%' },
          { label: 'Active Sessions', value: '3,492', icon: Users, trend: '+18%' },
          { label: 'Conversion Lift', value: '24.5%', icon: TrendingUp, trend: '+4.2%' },
        ].map((stat, i) => (
          <Card key={i} className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <stat.icon className="w-5 h-5 text-zinc-500" />
                <span className="text-emerald-500 text-xs font-bold">{stat.trend}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-[0.2em]">{stat.label}</p>
              <p className="text-3xl font-bold tracking-tighter mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-8">
        <Card className="col-span-2 bg-zinc-900/50 border-zinc-800 backdrop-blur-xl h-[450px]">
          <CardHeader>
            <CardTitle className="text-zinc-400 uppercase text-sm font-bold tracking-widest">Volume & Value Velocity</CardTitle>
          </CardHeader>
          <CardContent className="h-full pb-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="tvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#3f3f46" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#3f3f46" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#tvGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl h-[450px]">
          <CardHeader>
            <CardTitle className="text-zinc-400 uppercase text-sm font-bold tracking-widest">Attribution Share</CardTitle>
          </CardHeader>
          <CardContent className="h-full pb-16">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
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
