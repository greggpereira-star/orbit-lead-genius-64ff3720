import { createFileRoute, Link } from '@tanstack/react-router';
import * as React from 'react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setIsSent(true);
      toast.success('Reset link sent to your email');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-none shadow-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
        <CardDescription>
          {isSent 
            ? "Check your email for the reset link" 
            : "Enter your email to receive a password reset link"}
        </CardDescription>
      </CardHeader>
      {!isSent ? (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@company.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <div className="w-full space-y-4">
              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send reset link'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Back to login
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      ) : (
        <CardContent className="pt-6">
          <Button className="w-full" asChild>
            <Link to="/login">Back to login</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
