 import React from 'react';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Progress } from '@/components/ui/progress';
 import { Badge } from '@/components/ui/badge';
 import { BrainCircuit, Info, TrendingUp } from 'lucide-react';
 import { calculateLeadScore, LeadScoreResult } from '../services/scoring';
 
 interface LeadScoreCardProps {
   leadData: any;
 }
 
 export function LeadScoreCard({ leadData }: LeadScoreCardProps) {
   const result = calculateLeadScore(leadData);
 
   const getGradeColor = (grade: string) => {
     switch (grade) {
       case 'A': return 'bg-emerald-500 hover:bg-emerald-600';
       case 'B': return 'bg-blue-500 hover:bg-blue-600';
       case 'C': return 'bg-amber-500 hover:bg-amber-600';
       default: return 'bg-slate-500 hover:bg-slate-600';
     }
   };
 
   return (
     <Card className="border-none shadow-sm overflow-hidden">
       <CardHeader className="bg-primary/[0.02] border-b border-border/50 pb-4">
         <div className="flex justify-between items-start">
           <div className="flex items-center gap-2">
             <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
               <BrainCircuit className="h-5 w-5 text-primary" />
             </div>
             <div>
               <CardTitle className="text-base font-semibold">Lead Intelligence</CardTitle>
               <CardDescription className="text-xs">AI-driven predictive scoring</CardDescription>
             </div>
           </div>
           <Badge className={`${getGradeColor(result.grade)} border-none text-white text-lg px-3 py-0.5`}>
             Grade {result.grade}
           </Badge>
         </div>
       </CardHeader>
       <CardContent className="pt-6 space-y-6">
         <div className="flex items-center justify-between">
           <div className="space-y-1">
             <span className="text-sm font-medium text-muted-foreground">Overall Score</span>
             <div className="text-3xl font-bold text-foreground">{result.totalScore}<span className="text-lg text-muted-foreground">/100</span></div>
           </div>
           <div className="h-16 w-16 rounded-full border-4 border-primary/10 flex items-center justify-center relative">
             <div 
               className="absolute inset-0 border-4 border-primary rounded-full" 
               style={{ 
                 clipPath: `polygon(50% 50%, 50% 0%, ${result.totalScore > 50 ? '100% 0%, 100% 100%, 0% 100%, 0% 0%, 50% 0%' : '100% 0%, 100% 100%, 50% 100%'})`,
                 transform: `rotate(${result.totalScore * 3.6}deg)`
               }} 
             />
             <TrendingUp className="h-6 w-6 text-primary" />
           </div>
         </div>
 
         <div className="space-y-4">
           {result.dimensions.map((dim) => (
             <div key={dim.label} className="space-y-1.5">
               <div className="flex justify-between text-xs">
                 <span className="font-medium text-foreground flex items-center gap-1.5">
                   {dim.label}
                   <Info className="h-3 w-3 text-muted-foreground" />
                 </span>
                 <span className="text-muted-foreground">{dim.score}%</span>
               </div>
               <Progress value={dim.score} className="h-1.5" />
             </div>
           ))}
         </div>
 
         <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
           <p className="text-xs leading-relaxed text-muted-foreground">
             <span className="font-semibold text-foreground">AI Insight:</span> {result.summary}
           </p>
         </div>
       </CardContent>
     </Card>
   );
 }