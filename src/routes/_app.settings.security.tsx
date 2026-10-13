import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
  import { Shield, Key, History, User, Clock } from 'lucide-react';
  import { toast } from 'sonner';
  import { useState } from 'react';
  import { supabase } from '@/lib/supabase';

  export const Route = createFileRoute('/_app/settings/security')({
    component: SecuritySettings,
  });

  function SecuritySettings() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleUpdatePassword = async () => {
      if (newPassword !== confirmPassword) {
        toast.error('As senhas não são iguais');
        return;
      }
      if (newPassword.length < 8) {
        toast.error('A senha precisa ter ao menos 8 caracteres');
        return;
      }

      setIsLoading(true);
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        toast.success('Senha trocada');
        setNewPassword('');
        setConfirmPassword('');
      } catch (error: any) {
        toast.error(error.message || 'Não consegui trocar a senha');
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Trocar senha
            </CardTitle>
            <CardDescription>Troque a senha de tempos em tempos para manter a conta segura.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="new">Nova senha</Label>
              <Input 
                id="new" 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Repita a nova senha</Label>
              <Input 
                id="confirm" 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button onClick={handleUpdatePassword} disabled={isLoading}>
              {isLoading ? 'Trocando...' : 'Trocar senha'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Verificação em duas etapas
            </CardTitle>
            <CardDescription>Uma segunda barreira além da senha. Ainda não disponível.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => toast.info('Ainda não disponível')}>
              Ativar
            </Button>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Registro de auditoria
            </CardTitle>
            <CardDescription>Ações administrativas e eventos de segurança.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Aqui havia quatro registros FIXOS e inventados: "Admin User
                  conectou o Meta Pixel de 192.168.1.1 há 10 minutos", e outros
                  três no mesmo tom. Nenhum aconteceu. Numa tela de SEGURANÇA
                  isso é pior do que não ter a lista: quem olhasse veria
                  movimento onde não houve, e um acesso indevido de verdade
                  ficaria indistinguível do enfeite — a tela mostraria as mesmas
                  quatro linhas de qualquer jeito.

                  Até existir registro de verdade, a tela diz que não existe. */}
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm font-medium">Ainda não há registro de auditoria</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quando o histórico de ações administrativas estiver disponível, ele aparece aqui.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
