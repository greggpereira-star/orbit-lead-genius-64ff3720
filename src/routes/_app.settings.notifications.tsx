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
        <CardDescription>Como e quando você recebe aviso.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Avisos por e-mail</Label>
              <p className="text-xs text-muted-foreground">Resumo diário e avisos urgentes no seu e-mail.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Preference updated')} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label>Avisos no WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Cada lead novo chega na hora no seu WhatsApp.</p>
            </div>
            <Switch onCheckedChange={() => toast.success('Preference updated')} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label>Avisos no navegador</Label>
              <p className="text-xs text-muted-foreground">Notificação na área de trabalho quando entrar lead novo.</p>
            </div>
            <Switch defaultChecked onCheckedChange={() => toast.success('Preference updated')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
