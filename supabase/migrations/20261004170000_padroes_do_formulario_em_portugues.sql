-- O padrão de `forms.settings` estava em inglês
--
-- O DEFAULT da coluna, posto na criação da tabela, trazia
-- `"submit_label": "Submit"` e
-- `"success_message": "Thank you! We will contact you soon."`. Todo formulário
-- criado sem mexer nesses campos nascia com o botão e a mensagem de sucesso em
-- inglês, num app todo em português — e é texto que o LEAD vê, não o operador.
--
-- `type` também: o DEFAULT era 'traditional' enquanto `type_v2` já usava
-- 'standard'. Fica como está para não mudar comportamento de leitura; só os
-- textos mudam.

alter table public.forms
  alter column settings set default jsonb_build_object(
    'theme', 'premium-light',
    'capture_utms', true,
    'redirect_url', null,
    'submit_label', 'Enviar',
    'success_message', 'Recebemos seus dados. Entraremos em contato em breve.',
    'whatsapp_number', null,
    'cv_crm_integration', false
  );

-- Nenhum formulário existe em produção (medido em 04/10/2026: 0 linhas em
-- `forms`), então não há nada para corrigir retroativamente. Se houvesse, o
-- UPDATE abaixo cuidaria — e ele é seguro de rodar de qualquer forma, porque só
-- toca o que ainda está com o texto em inglês.
update public.forms
set settings = settings
  || case when settings ->> 'submit_label' = 'Submit'
          then jsonb_build_object('submit_label', 'Enviar') else '{}'::jsonb end
  || case when settings ->> 'success_message' = 'Thank you! We will contact you soon.'
          then jsonb_build_object('success_message', 'Recebemos seus dados. Entraremos em contato em breve.')
          else '{}'::jsonb end
where settings ->> 'submit_label' = 'Submit'
   or settings ->> 'success_message' = 'Thank you! We will contact you soon.';
