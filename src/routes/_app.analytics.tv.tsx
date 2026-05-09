import { createFileRoute } from '@tanstack/react-router';
import { TVDashboard } from '@/design-system/components/charts/TVDashboard';

export const Route = createFileRoute('/_app/analytics/tv')({
  component: TVDashboard,
});
