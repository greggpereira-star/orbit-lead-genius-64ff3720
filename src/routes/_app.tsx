import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '@/components/layout/AppLayout';

/**
 * Route: /_app
 * Decoupled layout component to ensure stable chunk splitting in TanStack Router.
 */
export const Route = createFileRoute('/_app')({
  component: AppLayout,
});
