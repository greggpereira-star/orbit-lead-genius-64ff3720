import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/company')({
  component: CompanySettings,
});

function CompanySettings() {
  const { company } = useAuth();
  const [name, setName] = useState(company?.name || '');

  const handleSave = () => {
    toast.success('Company settings updated successfully');
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Company Settings</CardTitle>
        <CardDescription>Manage your organization details and branding.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input 
              id="companyName" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Company Slug</Label>
            <Input id="slug" value={company?.slug} disabled />
            <p className="text-[10px] text-muted-foreground italic">The slug is used in your public form URLs.</p>
          </div>
        </div>
        <div className="pt-4">
          <Button onClick={handleSave}>Save Organization</Button>
        </div>
      </CardContent>
    </Card>
  );
}