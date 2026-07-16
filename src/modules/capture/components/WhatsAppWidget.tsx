import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, X, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase';


export function WhatsAppWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowNotification(true);
    }, 5000);
    
    // Lazy load company context without requiring full AuthContext if it's a landing page lead
    const loadContext = async () => {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        if (session?.user) {
          const { data: membership } = await getSupabase()
            .from('memberships')
            .select('company_id')
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (membership) setCompanyId(membership.company_id);
        }
      } catch (e) {
        // Silent fail for widget
      }
    };
    loadContext();

    return () => clearTimeout(timer);
  }, []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCompanyId = companyId || 'default-landing-context';
    setIsSubmitting(true);

    const qs = new URLSearchParams(window.location.search);
    const trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','fbc','fbp','gclid','gbraid','wbraid'] as const;
    const tracking: Record<string, string> = {};
    for (const k of trackingKeys) { const v = qs.get(k); if (v) tracking[k] = v; }

    const phone = '5511999999999';
    const message = 'Olá, vim pelo site e gostaria de mais informações.';

    try {
      const res = await fetch('/api/public/whatsapp-click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: targetCompanyId,
          phone,
          message,
          name,
          email,
          pageUrl: window.location.href,
          referrer: document.referrer,
          userAgent: navigator.userAgent,
          tracking,
        }),
      });
      const data = await res.json() as { whatsappUrl?: string };
      const url = data.whatsappUrl ?? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      toast.success('Redirecionando para o WhatsApp...');
      setIsOpen(false);
      setTimeout(() => window.open(url, '_blank'), 500);
    } catch {
      toast.error('Não foi possível registrar o clique, abrindo WhatsApp assim mesmo.');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-80"
          >
            <Card className="shadow-2xl border-none">
              <CardHeader className="bg-[#128C7E] text-white rounded-t-xl py-4 shadow-[inset_0_-4px_10px_rgba(0,0,0,0.1)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white/30 flex items-center justify-center shadow-lg">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold">Speak with an agent</CardTitle>
                      <p className="text-[10px] opacity-80">Usually replies in minutes</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/10"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wa-name" className="text-xs">Your Name</Label>
                    <Input 
                      id="wa-name" 
                      placeholder="John Doe" 
                      required 
                      className="h-9" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa-email" className="text-xs">Work Email</Label>
                    <Input 
                      id="wa-email" 
                      type="email" 
                      placeholder="john@company.com" 
                      required 
                      className="h-9" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white gap-2 font-bold"
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4" />
                    Start Conversation
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <AnimatePresence>
          {showNotification && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute right-20 top-0 bg-white shadow-lg border p-3 rounded-lg w-48 text-xs font-medium text-black"
            >
              Hi! How can I help you today?
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white border"
                onClick={() => setShowNotification(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <Button
          size="icon"
          className="h-14 w-14 rounded-full bg-[#25D366] hover:bg-[#128C7E] shadow-xl text-white group transition-all duration-300 hover:scale-110"
          onClick={() => {
            setIsOpen(!isOpen);
            setShowNotification(false);
          }}
        >
          <MessageSquare className="h-7 w-7 group-hover:rotate-12 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
