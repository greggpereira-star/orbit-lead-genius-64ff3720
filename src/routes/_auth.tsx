import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '@/components/layout/AuthLayout';

/**
 * Route: /_auth
 * Decoupled layout component to ensure stable chunk splitting in TanStack Router.
 */
export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
});
