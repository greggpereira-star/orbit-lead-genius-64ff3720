import { Button } from "@/components/ui/button";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { Globe, Zap } from "lucide-react";
import { useState } from "react";

export function SocialLogin() {
  const { loginWithGoogle, loginWithMeta, isLoading } = useAuth();
  const [pending, setPending] = useState<string | null>(null);

  const handleGoogle = async () => {
    setPending('google');
    await loginWithGoogle();
    setPending(null);
  };

  const handleMeta = async () => {
    setPending('meta');
    await loginWithMeta();
    setPending(null);
  };

  return (
    <div className="grid grid-cols-2 gap-4 w-full">
      <Button 
        variant="outline" 
        className="h-11 font-bold border-slate-200 hover:bg-slate-50 gap-2" 
        onClick={handleGoogle}
        disabled={isLoading || !!pending}
      >
        {pending === 'google' ? (
          <div className="h-4 w-4 border-2 border-primary/20 border-t-primary animate-spin rounded-full" />
        ) : (
          <Globe className="h-4 w-4 text-blue-500" />
        )}
        Google
      </Button>
      <Button 
        variant="outline" 
        className="h-11 font-bold border-slate-200 hover:bg-slate-50 gap-2" 
        onClick={handleMeta}
        disabled={isLoading || !!pending}
      >
        {pending === 'meta' ? (
          <div className="h-4 w-4 border-2 border-primary/20 border-t-primary animate-spin rounded-full" />
        ) : (
          <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
        )}
        Meta
      </Button>
    </div>
  );
}