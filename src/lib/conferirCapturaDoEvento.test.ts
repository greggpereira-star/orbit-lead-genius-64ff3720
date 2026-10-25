import { describe, expect, it } from 'vitest';
import { conferirCaptura } from './conferirCapturaDoEvento';

const base = [{ event_id: 'e1', email: 'Ana@Teste.com', phone: '(27) 99999-1234' }];

describe('conferirCaptura', () => {
  it('reconhece pelo event_id', () => {
    expect(conferirCaptura({ eventId: 'e1' }, base)).toBe('por_event_id');
  });
  it('cai para o e-mail, sem diferenciar caixa', () => {
    expect(conferirCaptura({ eventId: 'x', email: 'ana@teste.com' }, base)).toBe('por_contato');
  });
  it('cai para o telefone pelos 8 últimos dígitos', () => {
    expect(conferirCaptura({ eventId: 'x', phone: '+55 27 99999-1234' }, base)).toBe('por_contato');
  });
  it('marca sem captura quando nada confere', () => {
    expect(conferirCaptura({ eventId: 'x', email: 'outro@x.com', phone: '11 1111-2222' }, base)).toBe('sem_captura');
    expect(conferirCaptura({ eventId: 'x' }, [])).toBe('sem_captura');
  });
  it('contato vazio nunca confere', () => {
    expect(conferirCaptura({ eventId: 'x', email: '', phone: '' }, [{ event_id: null, email: '', phone: '' }])).toBe('sem_captura');
  });
});
