import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/automations')({
  component: AutomationSettings,
});

function AutomationSettings() {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Automation Engine Settings
        </CardTitle>
        <CardDescription>Configure global behaviors for your sales and marketing workflows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Enrich Leads</Label>
              <p className="text-xs text-muted-foreground">Automatically find social profiles and company data for new leads.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Settings updated')} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label>Strict Deduplication</Label>
              <p className="text-xs text-muted-foreground">Prevent duplicate leads by matching both email and phone numbers.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Settings updated')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
