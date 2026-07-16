import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { quickReplyService, type ChatQuickReply } from '@/modules/chat/services/quickReplyService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, Zap } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/quick-replies')({
  component: QuickRepliesSettings,
});

function QuickRepliesSettings() {
  const { company } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['chat', 'quick-replies', companyId],
    queryFn: () => quickReplyService.list(companyId!),
    enabled: !!companyId,
  });
  const items = q.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['chat', 'quick-replies', companyId] });

  if (!companyId) return <div className="text-muted-foreground text-sm">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Respostas rápidas</h2>
        <p className="text-sm text-muted-foreground">
          Crie atalhos de mensagens prontas para agilizar o atendimento no Chat ao vivo. Digite <code className="bg-muted px-1 rounded">/</code> na caixa de resposta para abrir o seletor.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" /> Atalhos
          </CardTitle>
          <ReplyDialog companyId={companyId} onSaved={refresh} />
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum atalho criado ainda. Ex.: <code className="bg-muted px-1 rounded">/oi</code> → "Olá! Como posso ajudar?".
            </p>
          )}
          {items.map((r) => (
            <ReplyRow key={r.id} reply={r} companyId={companyId} onChanged={refresh} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReplyDialog({
  companyId,
  onSaved,
  existing,
  trigger,
}: {
  companyId: string;
  onSaved: () => void;
  existing?: ChatQuickReply;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState(existing?.shortcut ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const s = shortcut.trim().replace(/^\/+/, '');
    const c = content.trim();
    if (!s || !c) return;
    setSaving(true);
    try {
      if (existing) {
        await quickReplyService.update(existing.id, { shortcut: s, content: c });
      } else {
        await quickReplyService.create({ companyId, shortcut: s, content: c });
      }
      toast.success('Atalho salvo');
      setOpen(false);
      if (!existing) {
        setShortcut('');
        setContent('');
      }
      onSaved();
    } catch (e) {
      toast.error('Erro ao salvar', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo atalho
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Editar atalho' : 'Novo atalho'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Atalho (sem barra)</Label>
            <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="oi" />
            <p className="text-xs text-muted-foreground">
              No chat, digite <code className="bg-muted px-1 rounded">/{shortcut || 'oi'}</code> para acionar.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Mensagem</Label>
            <Textarea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Olá! Como posso ajudar você hoje?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !shortcut.trim() || !content.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplyRow({
  reply,
  companyId,
  onChanged,
}: {
  reply: ChatQuickReply;
  companyId: string;
  onChanged: () => void;
}) {
  async function remove() {
    if (!confirm(`Excluir atalho /${reply.shortcut}?`)) return;
    await quickReplyService.remove(reply.id);
    toast.success('Atalho removido');
    onChanged();
  }
  return (
    <div className="flex items-start justify-between gap-3 border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/{reply.shortcut}</code>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mt-1">{reply.content}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <ReplyDialog
          companyId={companyId}
          onSaved={onChanged}
          existing={reply}
          trigger={
            <Button variant="ghost" size="icon">
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
        <Button variant="ghost" size="icon" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
