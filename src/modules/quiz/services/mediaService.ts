import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'quiz-media';
// 1 ano (max permitido pelo Supabase Storage para signed URLs)
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'];

const IMAGE_MAX = 5 * 1024 * 1024;      // 5MB
const VIDEO_MAX = 20 * 1024 * 1024;     // 20MB
const AUDIO_MAX = 10 * 1024 * 1024;     // 10MB

export type MediaKind = 'image' | 'video' | 'audio';

export interface UploadResult {
  url: string;         // signed URL utilizável no player público
  storagePath: string; // caminho relativo no bucket
  mimeType: string;
  size: number;
}

function detectKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  throw new Error(`Tipo de arquivo não suportado: ${file.type || 'desconhecido'}`);
}

function validate(file: File, kind: MediaKind): void {
  if (kind === 'image') {
    if (!IMAGE_MIME.includes(file.type)) throw new Error('Formato inválido. Use JPG, PNG, WEBP, GIF ou AVIF.');
    if (file.size > IMAGE_MAX) throw new Error('Imagem excede 5MB.');
  } else if (kind === 'video') {
    if (!VIDEO_MIME.includes(file.type)) throw new Error('Formato de vídeo inválido. Use MP4, WEBM ou MOV.');
    if (file.size > VIDEO_MAX) throw new Error('Vídeo excede 20MB.');
  } else {
    if (!AUDIO_MIME.includes(file.type)) throw new Error('Formato de áudio inválido. Use MP3, WAV, OGG ou M4A.');
    if (file.size > AUDIO_MAX) throw new Error('Áudio excede 10MB.');
  }
}

export const mediaService = {
  detectKind,

  /**
   * Faz upload de um arquivo para o bucket `quiz-media` e retorna uma URL
   * assinada válida por 1 ano. Registra também na tabela `quiz_media`.
   */
  async upload(params: { companyId: string; quizId: string; userId?: string; file: File }): Promise<UploadResult> {
    const { companyId, quizId, userId, file } = params;
    const kind = detectKind(file);
    validate(file, kind);

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
    const path = `${companyId}/${quizId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error('Falha ao gerar URL assinada.');

    // Registra a mídia (best-effort; falha aqui não bloqueia o upload).
    try {
      await supabase.from('quiz_media').insert({
        company_id: companyId,
        quiz_id: quizId,
        uploaded_by: userId ?? null,
        url: signed.signedUrl,
        storage_path: path,
        media_type: kind,
        mime_type: file.type,
        size_bytes: file.size,
      } as never);
    } catch (e) {
      console.warn('quiz_media insert falhou (upload OK):', e);
    }

    return { url: signed.signedUrl, storagePath: path, mimeType: file.type, size: file.size };
  },

  /** Gera nova URL assinada para um caminho existente (útil se expirar). */
  async refreshUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw error ?? new Error('Falha ao renovar URL.');
    return data.signedUrl;
  },
};
