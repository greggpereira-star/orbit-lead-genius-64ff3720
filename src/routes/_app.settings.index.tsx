 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 
 export const Route = createFileRoute('/_app/settings/')({
   component: ProfileSettings,
 });
 
 function ProfileSettings() {
   const { user } = useAuth();
 
   return (
     <Card className="border-none shadow-sm">
       <CardHeader>
         <CardTitle>Profile Information</CardTitle>
         <CardDescription>Seus dados e como o time te vê.</CardDescription>
       </CardHeader>
       <CardContent className="space-y-6">
         <div className="grid grid-cols-2 gap-4">
           <div className="space-y-2">
             <Label htmlFor="name">Nome completo</Label>
             <Input id="name" defaultValue={user?.name} />
           </div>
           <div className="space-y-2">
             <Label htmlFor="email">E-mail</Label>
             <Input id="email" defaultValue={user?.email} disabled />
           </div>
         </div>
         <Button>Salvar</Button>
       </CardContent>
     </Card>
   );
 }