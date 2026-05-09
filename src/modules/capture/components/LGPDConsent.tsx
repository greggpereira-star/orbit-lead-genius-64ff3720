import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface LGPDConsentProps {
  onConsentChange: (consents: { marketing: boolean; tracking: boolean }) => void;
}

export function LGPDConsent({ onConsentChange }: LGPDConsentProps) {
  const [marketing, setMarketing] = React.useState(true);
  const [tracking, setTracking] = React.useState(true);

  React.useEffect(() => {
    onConsentChange({ marketing, tracking });
  }, [marketing, tracking, onConsentChange]);

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-start space-x-3">
        <Checkbox 
          id="marketing" 
          checked={marketing} 
          onCheckedChange={(checked) => setMarketing(!!checked)} 
        />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="marketing" className="text-xs font-medium text-foreground">
            I agree to receive marketing communications and updates.
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Your data is protected under our Privacy Policy. You can unsubscribe at any time.
          </p>
        </div>
      </div>

      <div className="flex items-start space-x-3">
        <Checkbox 
          id="tracking" 
          checked={tracking} 
          onCheckedChange={(checked) => setTracking(!!checked)} 
        />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="tracking" className="text-xs font-medium text-foreground">
            I agree to website usage tracking to improve my experience.
          </Label>
          <p className="text-[10px] text-muted-foreground">
            We use first-party cookies for attribution and analytics.
          </p>
        </div>
      </div>
      
      <p className="text-[9px] text-muted-foreground italic">
        By submitting this form, you acknowledge that you have read and agreed to our 
        <a href="/privacy" className="underline ml-1">Privacy Policy</a> and 
        <a href="/terms" className="underline ml-1">Terms of Service</a>. 
        Version: 2.4.0-2024
      </p>
    </div>
  );
}
