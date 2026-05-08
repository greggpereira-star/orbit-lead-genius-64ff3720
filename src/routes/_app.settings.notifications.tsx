import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/notifications')({
  component: NotificationSettings,
});

function NotificationSettings() {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Control how and when you receive alerts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive daily summaries and critical alerts via email.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Preference updated')} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label>WhatsApp Alerts</Label>
              <p className="text-xs text-muted-foreground">Get real-time lead notifications on your WhatsApp.</p>
            </div>
            <Switch onCheckedChange={() => toast.success('Preference updated')} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label>Browser Notifications</Label>
              <p className="text-xs text-muted-foreground">Enable desktop push notifications for new leads.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Preference updated')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
