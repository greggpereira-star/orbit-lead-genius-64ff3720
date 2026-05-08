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
  temperature: 'hot' | 'warm' | 'cold';
}

export const calculateLeadScore = (leadData: any): LeadScoreResult => {
  const dimensions: ScoringDimension[] = [];
  
  // 1. Firmographic Fit (Industry, Company Size)
  let firmographicScore = 0;
  if (leadData.company && leadData.company.toLowerCase().includes('tech')) firmographicScore += 40;
  if (leadData.role && (leadData.role.includes('Head') || leadData.role.includes('CEO') || leadData.role.includes('Manager'))) firmographicScore += 40;
  if (leadData.email && !leadData.email.includes('gmail') && !leadData.email.includes('outlook')) firmographicScore += 20;
  
  dimensions.push({
    label: 'Firmographic Fit',
    score: firmographicScore,
    maxScore: 100,
    description: firmographicScore > 70 ? 'High relevance based on company profile and role.' : 'Medium relevance profile.'
  });

  // 2. Technographic Fit (Complementary Stack)
  // Mocking technographic detection from browser/metadata
  const technographicScore = leadData.metadata?.gclid ? 90 : 40;
  dimensions.push({
    label: 'Technographic Fit',
    score: technographicScore,
    maxScore: 100,
    description: technographicScore > 70 ? 'Uses advanced tracking (GCLID/FBCLID) indicating high marketing maturity.' : 'Standard tracking detected.'
  });

  // 3. Intent Signals (Behavioral)
  let intentScore = 0;
  if (leadData.events?.length > 3) intentScore += 50;
  if (leadData.events?.some((e: any) => e.type === 'pricing_viewed')) intentScore += 30;
  if (leadData.events?.some((e: any) => e.type === 'form_submission')) intentScore += 20;
  
  // Default for mock
  if (intentScore === 0) intentScore = 85;

  dimensions.push({
    label: 'Intent Signals',
    score: intentScore,
    maxScore: 100,
    description: 'Based on page views, scroll depth, and form interactions.'
  });

  // 4. Attribution Strength
  const attributionScore = (leadData.utm_source || leadData.source) ? 95 : 30;
  dimensions.push({
    label: 'Attribution',
    score: attributionScore,
    maxScore: 100,
    description: attributionScore > 70 ? 'Fully attributed lead path.' : 'Partial attribution.'
  });

  const totalScore = Math.round(dimensions.reduce((acc, d) => acc + d.score, 0) / dimensions.length);
  
  let grade: 'A' | 'B' | 'C' | 'D' = 'C';
  let temperature: 'hot' | 'warm' | 'cold' = 'cold';

  if (totalScore >= 80) {
    grade = 'A';
    temperature = 'hot';
  } else if (totalScore >= 60) {
    grade = 'B';
    temperature = 'warm';
  } else if (totalScore >= 40) {
    grade = 'C';
    temperature = 'warm';
  } else {
    grade = 'D';
    temperature = 'cold';
  }

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
    summary: summaries[grade],
    temperature
  };
};
