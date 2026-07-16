import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { mediaService, type MediaKind } from '../services/mediaService';
import { useAuth } from '@/core/auth/hooks/useAuth';

interface Props {
  quizId: string;
  value?: string;
  accept: MediaKind | 'image-or-video';
  onChange: (url: string) => void;
  label?: string;
  compact?: boolean;
}

const ACCEPT_MAP: Record<Props['accept'], string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
  video: 'video/mp4,video/webm,video/quicktime',
  audio: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4',
  'image-or-video': 'image/*,video/*',
};

export function MediaUploader({ quizId, value, accept, onChange, label, compact }: Props) {
  const { company, user } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || !company?.id) return;
    setUploading(true);
    try {
      const res = await mediaService.upload({
        companyId: company.id,
        quizId,
        userId: user?.id,
        file,
      });
      onChange(res.url);
      toast.success('Mídia enviada');
    } catch (e) {
      toast.error('Falha no upload: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}

      {value && !compact && (
        <div className="relative rounded-md border overflow-hidden bg-muted">
          {accept === 'audio' ? (
            <audio controls src={value} className="w-full" />
          ) : /\.(mp4|webm|mov)(\?|$)/i.test(value) || accept === 'video' ? (
            <video src={value} className="w-full max-h-40 object-cover" muted />
          ) : (
            <img src={value} alt="preview" className="w-full max-h-40 object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background"
            aria-label="Remover mídia"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="Cole uma URL ou envie um arquivo"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MAP[accept]}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
