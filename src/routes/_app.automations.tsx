import { createFileRoute } from '@tanstack/react-router';
import { PainelDeAutomacao } from '@/modules/automation/components/PainelDeAutomacao';

export const Route = createFileRoute('/_app/automations')({
  component: PainelDeAutomacao,
});
