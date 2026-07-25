/**
 * Anexos de um lead (proposta, contrato, documento).
 *
 * O bucket é privado: a URL é assinada na hora do clique, com validade curta.
 * Gerar URL longa e guardar no banco — como o quiz faz com mídia pública —
 * seria vazar proposta comercial pra quem descobrisse o link.
 */
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'lead-attachments';

/** 5 minutos: tempo de abrir ou baixar, não de compartilhar por aí. */
const SIGNED_URL_TTL_SECONDS = 300;

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface LeadAttachment {
  id: string;
  lead_id: string;
  company_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listLeadAttachments(leadId: string): Promise<LeadAttachment[]> {
  const { data, error } = await (supabase as any)
    .from('lead_attachments')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadAttachment[];
}

export interface UploadAttachmentInput {
  companyId: string;
  leadId: string;
  file: File;
  uploadedBy: string | null;
  uploadedByName: string | null;
}

export async function uploadLeadAttachment(input: UploadAttachmentInput): Promise<LeadAttachment> {
  const { file } = input;

  // Validação no cliente é conveniência — o bucket também limita tamanho e
  // tipo, então um upload forjado não passa mesmo assim.
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" tem ${formatFileSize(file.size)}. O limite é 10 MB.`);
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error('Formato não aceito. Envie PDF, imagem, Word ou Excel.');
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
  // company_id como primeira pasta: é o que a política de storage confere.
  const path = `${input.companyId}/${input.leadId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await (supabase as any)
    .from('lead_attachments')
    .insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      uploaded_by: input.uploadedBy,
      uploaded_by_name: input.uploadedByName,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select('*')
    .single();

  if (error) {
    // Sem o registro, o arquivo viraria lixo invisível no bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }

  return data as LeadAttachment;
}

/** URL assinada gerada no clique — nunca guardada. */
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Falha ao gerar o link do arquivo.');
  return data.signedUrl;
}

export async function deleteLeadAttachment(attachment: LeadAttachment): Promise<void> {
  const { error } = await (supabase as any)
    .from('lead_attachments')
    .delete()
    .eq('id', attachment.id);
  if (error) throw new Error(error.message);

  // Remove o arquivo depois do registro: se sobrar arquivo órfão é desperdício
  // de espaço, mas registro apontando pra arquivo inexistente quebraria a tela.
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
}
