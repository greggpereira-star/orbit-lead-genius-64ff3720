 export interface ScoringDimension {
   label: string;
   score: number;
   maxScore: number;
   description: string;
 }
 
 export interface LeadScoreResult {
   totalScore: number;
   dimensions: ScoringDimension[];
   grade: 'A' | 'B' | 'C' | 'D';
   summary: string;
 }
 
 export const calculateLeadScore = (leadData: any): LeadScoreResult => {
   const dimensions: ScoringDimension[] = [
     {
       label: 'Firmographic Fit',
       score: 85,
       maxScore: 100,
       description: 'Matches target industry (SaaS) and company size (50-200).'
     },
     {
       label: 'Technographic Fit',
       score: 70,
       maxScore: 100,
       description: 'Uses complementary technologies like Stripe and Meta Ads.'
     },
     {
       label: 'Intent Signals',
       score: 90,
       maxScore: 100,
       description: 'High engagement with pricing page and documentation.'
     },
     {
       label: 'Authority',
       score: 60,
       maxScore: 100,
       description: 'Decision maker role (CTO/CEO) not yet confirmed.'
     }
   ];
 
   const totalScore = Math.round(dimensions.reduce((acc, d) => acc + d.score, 0) / dimensions.length);
   
   let grade: 'A' | 'B' | 'C' | 'D' = 'C';
   if (totalScore >= 80) grade = 'A';
   else if (totalScore >= 60) grade = 'B';
   else if (totalScore >= 40) grade = 'C';
   else grade = 'D';
 
   const summaries = {
     A: "Highly qualified lead with strong intent and perfect fit. Immediate sales follow-up recommended.",
     B: "Good quality lead. Nurture through automated sequences focusing on authority verification.",
     C: "Marketing qualified. Requires further enrichment and awareness content.",
     D: "Low fit or low intent. Keep in long-term nurturing cycle."
   };
 
   return {
     totalScore,
     dimensions,
     grade,
     summary: summaries[grade]
   };
 };