export interface MetaFalsa {
  chamadas: Array<{ metodo: string; caminho: string; query: Record<string, string>; corpo: Record<string, unknown>; token: string | null }>;
  templates: Map<string, unknown[]>;
  numeros: Map<string, Record<string, unknown>>;
  iniciar(): Promise<string>;
  parar(): Promise<void>;
  aprovarTemplate(waba: string, nome: string, status?: string): void;
  guardarMidia(id: string, mime: string, bytes: Buffer): void;
  readonly base: string;
}
export function criarMetaFalsa(opts?: { porta?: number }): MetaFalsa;
export function assinar(corpoCru: string, segredo: string): string;
