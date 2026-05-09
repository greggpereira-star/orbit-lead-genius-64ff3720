import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
 import { Shield, Key, History, User, Activity, Clock } from 'lucide-react';
       <Card className="border-none shadow-sm">
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <History className="h-5 w-5 text-primary" />
             Audit Logs
           </CardTitle>
           <CardDescription>Review recent administrative actions and security events.</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="space-y-4">
             {[
               { id: 1, user: 'Admin User', action: 'Connected Meta Pixel', ip: '192.168.1.1', time: '10 mins ago' },
               { id: 2, user: 'Sales Manager', action: 'Changed Pipeline Stage: Lead #123', ip: '10.0.0.5', time: '1 hour ago' },
               { id: 3, user: 'System', action: 'Automated Lead Enrichment', ip: 'internal', time: '2 hours ago' },
               { id: 4, user: 'Admin User', action: 'Updated API Credentials', ip: '192.168.1.1', time: '5 hours ago' },
             ].map((log) => (
               <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/5">
                 <div className="flex items-center gap-3">
                   <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                     <User className="h-4 w-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium">{log.action}</p>
                     <p className="text-[10px] text-muted-foreground">{log.user} • IP: {log.ip}</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                   <Clock className="h-3 w-3" />
                   {log.time}
                 </div>
               </div>
             ))}
             <Button variant="ghost" className="w-full text-xs text-primary font-bold">
               View Full Audit Trail
             </Button>
           </div>
         </CardContent>
       </Card>
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/security')({
  component: SecuritySettings,
});

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Change Password
          </CardTitle>
          <CardDescription>Update your password to keep your account secure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="current">Current Password</Label>
            <Input id="current" type="password" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new">New Password</Label>
            <Input id="new" type="password" />
          </div>
          <Button onClick={() => toast.success('Password updated')}>Update Password</Button>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>Add an extra layer of security to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline">Enable 2FA</Button>
        </CardContent>
      </Card>
    </div>
  );
}
