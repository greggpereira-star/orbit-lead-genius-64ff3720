 import { createFileRoute, Link } from '@tanstack/react-router';
 import { Button } from '@/components/ui/button';
 import { 
   ArrowRight, 
   CheckCircle2, 
   Zap, 
   Target, 
   BrainCircuit, 
   BarChart3, 
   Globe,
   LayoutDashboard
 } from 'lucide-react';
 
 export const Route = createFileRoute('/')({
   component: LandingPage,
 });
 
 function LandingPage() {
   return (
     <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-primary/10">
       {/* Navigation */}
       <nav className="fixed top-0 w-full z-50 bg-[#f6f9fc]/80 backdrop-blur-md border-b border-slate-200/50">
         <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-secondary/20">
               L
             </div>
             <span className="font-bold text-xl tracking-tight">Lovable CRM</span>
           </div>
           <div className="hidden md:flex items-center gap-8">
             <a href="#features" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors">Features</a>
             <a href="#solutions" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors">Solutions</a>
             <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors">Pricing</a>
           </div>
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="ghost" className="text-sm font-semibold">Sign in</Button>
              </Link>
               <Link to="/register">
                 <Button className="bg-[#635bff] hover:bg-[#635bff]/90 text-sm font-semibold px-5 py-2.5 shadow-lg shadow-[#635bff]/20 text-white">
                   Get Started
                 </Button>
               </Link>
            </div>
         </div>
       </nav>
 
       <main className="pt-32">
         {/* Hero Section */}
         <section className="px-6 pb-24 md:pb-32 overflow-hidden">
           <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
             <div className="space-y-8 relative z-10">
               <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-bold uppercase tracking-wider animate-in fade-in slide-in-from-bottom-4 duration-1000">
                 <Zap className="h-3.5 w-3.5 fill-primary" />
                 Enterprise Lead Intelligence
               </div>
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#0a2540] leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
                  Convert every <span className="text-[#635bff] italic font-serif">click</span> into revenue.
                </h1>
               <p className="text-xl text-slate-600 leading-relaxed max-w-xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                 The modern CRM that combines deep lead intelligence, marketing attribution, and automated workflows to scale your sales team.
               </p>
                <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
                   <Link to="/register">
                     <Button size="lg" className="h-14 px-8 text-lg font-bold gap-3 shadow-2xl shadow-[#635bff]/30 group bg-[#635bff] hover:bg-[#635bff]/90 text-white">
                       Start Free Trial
                       <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                     </Button>
                   </Link>
                  <p className="text-sm text-slate-500 font-medium italic px-4">
                    Join 2,500+ high-growth companies.
                  </p>
                </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-8 border-t border-slate-100 animate-in fade-in duration-1000 delay-700">
                 <div className="space-y-1">
                   <div className="text-2xl font-bold">148%</div>
                   <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">ROI Growth</div>
                 </div>
                 <div className="space-y-1">
                   <div className="text-2xl font-bold">10M+</div>
                   <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Leads Scored</div>
                 </div>
                 <div className="hidden sm:block space-y-1">
                   <div className="text-2xl font-bold">30+</div>
                   <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Integrations</div>
                 </div>
               </div>
             </div>
 
             <div className="relative animate-in fade-in slide-in-from-right-12 duration-1000 delay-300">
               <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-transparent rounded-[2rem] blur-3xl opacity-50" />
               <div className="relative bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden ring-1 ring-slate-200/50">
                 <div className="h-10 border-b border-slate-100 bg-slate-50/50 flex items-center px-4 gap-1.5">
                   <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                   <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                   <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                 </div>
                 <div className="p-1">
                   <img 
                     src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426&h=1600" 
                     alt="Dashboard Preview" 
                     className="w-full h-auto rounded-xl shadow-inner"
                   />
                 </div>
               </div>
             </div>
           </div>
         </section>
 
         {/* Features Grid */}
         <section id="features" className="py-24 bg-slate-50/50 border-y border-slate-100">
           <div className="max-w-7xl mx-auto px-6">
             <div className="text-center space-y-4 mb-20">
               <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900">
                 Everything you need to <span className="text-primary">win</span>.
               </h2>
               <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                 A complete set of tools designed for the modern sales cycle, from first click to closed deal.
               </p>
             </div>
 
             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
               {[
                 {
                   title: 'Lead Intelligence',
                   desc: 'Predictive scoring based on technographics, firmographics, and behavior.',
                   icon: BrainCircuit,
                   color: 'bg-indigo-50 text-indigo-600'
                 },
                 {
                   title: 'Marketing Attribution',
                   desc: 'Track UTMs, GCLID, and FBCLID to see exactly which ads drive revenue.',
                   icon: Target,
                   color: 'bg-emerald-50 text-emerald-600'
                 },
                 {
                   title: 'Automated Workflows',
                   desc: 'Trigger Slack, WhatsApp, and Email alerts the second a hot lead arrives.',
                   icon: Zap,
                   color: 'bg-amber-50 text-amber-600'
                 },
                 {
                   title: 'Sales Pipeline',
                   desc: 'A visual Kanban board that helps you move deals faster through the funnel.',
                   icon: LayoutDashboard,
                   color: 'bg-blue-50 text-blue-600'
                 },
                 {
                   title: 'Real-time Analytics',
                   desc: 'Monitor ROI and conversion rates across all your marketing channels.',
                   icon: BarChart3,
                   color: 'bg-rose-50 text-rose-600'
                 },
                 {
                   title: 'Global Integrations',
                   desc: 'Connect with Meta CAPI, Google Ads, WhatsApp, and legacy CRMs.',
                   icon: Globe,
                   color: 'bg-slate-100 text-slate-700'
                 }
               ].map((feature, i) => (
                 <div key={i} className="group p-8 bg-white border border-slate-100 rounded-3xl hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
                   <div className={`h-12 w-12 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                     <feature.icon className="h-6 w-6" />
                   </div>
                   <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                   <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
                 </div>
               ))}
             </div>
           </div>
         </section>
 
         {/* Social Proof */}
         <section className="py-24">
           <div className="max-w-7xl mx-auto px-6 flex flex-col items-center">
             <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-12">Trusted by industry leaders</div>
             <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
               {['STRIPE', 'PIPEDRIVE', 'HUBSPOT', 'ZAPIER', 'META'].map(logo => (
                 <div key={logo} className="text-2xl font-black text-slate-900 tracking-tighter">{logo}</div>
               ))}
             </div>
           </div>
         </section>
 
         {/* CTA Footer */}
         <section className="px-6 pb-24">
           <div className="max-w-7xl mx-auto bg-slate-900 rounded-[3rem] p-12 md:p-24 overflow-hidden relative">
             <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/20 to-transparent" />
             <div className="relative z-10 max-w-2xl space-y-8">
               <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight">
                 Ready to scale your <span className="text-primary italic">sales machine</span>?
               </h2>
               <p className="text-slate-400 text-xl leading-relaxed">
                 Start your 14-day trial today and see the difference intelligence makes.
               </p>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                   <Link to="/register">
                     <Button size="lg" className="h-16 px-10 text-xl font-bold gap-3 shadow-2xl shadow-[#635bff]/30 bg-[#635bff] hover:bg-[#635bff]/90 text-white">
                       Get Started Now
                       <ArrowRight className="h-6 w-6" />
                     </Button>
                   </Link>
                   <Button size="lg" variant="outline" className="h-16 px-10 text-xl font-bold border-slate-600 text-white hover:bg-white/10">
                     Book a Demo
                   </Button>
                </div>
             </div>
           </div>
         </section>
       </main>
 
       <footer className="border-t border-slate-100 py-12">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="flex items-center gap-2">
             <div className="h-7 w-7 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-base">
               L
             </div>
             <span className="font-bold text-slate-900">Lovable CRM</span>
           </div>
           <div className="flex gap-8 text-sm text-slate-500 font-medium">
             <a href="#" className="hover:text-primary">Privacy</a>
             <a href="#" className="hover:text-primary">Terms</a>
             <a href="#" className="hover:text-primary">Security</a>
             <a href="#" className="hover:text-primary">Status</a>
           </div>
           <div className="text-sm text-slate-400">
             © 2024 Lovable CRM Inc. Built for winners.
           </div>
         </div>
       </footer>
     </div>
   );
 }
