import * as React from 'react';

/**
 * Ícone do canal WhatsApp: balão redondo com o fone dentro, no traço dos ícones
 * do lucide (24 px, `currentColor`). Existe porque o menu usava o MESMO balão
 * quadrado para "Chat ao vivo" e "WhatsApp", e no menu recolhido, sem texto, os
 * dois eram indistinguíveis. Não é a marca registrada: é um glifo próprio.
 */
export function WhatsAppIcon({ className, ...resto }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...resto}
    >
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9.2 8.6c0 3.3 2.9 6.2 6.2 6.2l1.1-1.7-2.1-1-.9.8a4.6 4.6 0 0 1-2.1-2.1l.8-.9-1-2.1-1.1.8z" />
    </svg>
  );
}
