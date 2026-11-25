// Seção "Campos do jogo" das telas do editor (Personagens, Armas, Propriedades): mostra os campos que o jogo
// definiu em jogo/scripts/definicoes.js para aquele tipo de coisa, já com o valor salvo (ou o padrão).
import { definicoes, valoresCampos, type AlvoCampo } from '../core/definicoes';
import { el } from './dom';
import { dica } from './legenda';

/** Abre as Definições do jogo no painel de Código (o editor liga isto). */
export const ligacoesCampos = { abrirDefinicoes: () => {} };

/**
 * Campos do jogo para editar. aplicar(chave, valor) grava (a tela salva do jeito dela).
 * acoes = nomes de ações/animações para os campos do tipo "acao".
 */
export function secaoCamposJogo(alvo: AlvoCampo, salvos: Record<string, unknown> | undefined, aplicar: (chave: string, valor: number | string | boolean) => void, acoes: string[] = []): HTMLElement[] {
  const defs = definicoes()[alvo];
  const titulo = el('h3', {}, 'Campos do jogo');
  dica(titulo, 'Campos do jogo', 'Campos que o seu jogo criou em Código › Sistema do jogo › Definições do jogo (definicoes.js). No código: eu.campos.nome; no script desta coisa: config.campos.');
  const abrir = el('button', { type: 'button', class: 'secundario largo' }, Object.keys(defs).length ? 'Editar as definições (código)' : 'Criar campos do jogo (código)');
  dica(abrir, 'Definições do jogo', 'Abre definicoes.js no painel de Código: cada campo escrito lá aparece aqui.');
  abrir.addEventListener('click', () => ligacoesCampos.abrirDefinicoes());
  if (!Object.keys(defs).length) return [titulo, el('p', { class: 'dica-campo' }, 'Nenhum campo próprio ainda. Ex.: "dano do ataque forte", "foge da luz".'), abrir];
  const valores = valoresCampos(defs, salvos);
  const linhas: HTMLElement[] = [titulo];
  for (const [chave, c] of Object.entries(defs)) {
    const id = `campo-${alvo}-${chave}`;
    const v = valores[chave];
    let input: HTMLElement;
    if (c.tipo === 'sim_nao') {
      const cb = el('input', { type: 'checkbox', id }) as HTMLInputElement;
      cb.checked = !!v;
      cb.addEventListener('change', () => aplicar(chave, cb.checked));
      const lab = el('label', { class: 'check' }, cb, c.nome);
      dica(lab, c.nome, `${c.texto ? c.texto + ' ' : ''}Código: eu.campos.${chave}`);
      linhas.push(lab);
      continue;
    }
    if (c.tipo === 'numero') {
      const i = el('input', { type: 'number', id, value: Number(v), step: c.passo ?? 1, ...(c.min !== undefined ? { min: c.min } : {}), ...(c.max !== undefined ? { max: c.max } : {}) }) as HTMLInputElement;
      i.addEventListener('change', () => {
        let n = Number(i.value);
        if (!Number.isFinite(n)) return;
        if (c.min !== undefined) n = Math.max(c.min, n);
        if (c.max !== undefined) n = Math.min(c.max, n);
        aplicar(chave, n);
      });
      input = i;
    } else if (c.tipo === 'lista') {
      const s = el('select', { id }, ...(c.opcoes ?? []).map((o) => el('option', { value: o }, o))) as HTMLSelectElement;
      s.value = String(v);
      s.addEventListener('change', () => aplicar(chave, s.value));
      input = s;
    } else if (c.tipo === 'cor') {
      const i = el('input', { type: 'color', id, value: String(v) || '#ffffff' }) as HTMLInputElement;
      i.addEventListener('change', () => aplicar(chave, i.value));
      input = i;
    } else {
      const lista = c.tipo === 'acao' ? `${id}-lista` : undefined;
      const i = el('input', { type: 'text', id, value: String(v), ...(lista ? { list: lista } : {}) }) as HTMLInputElement;
      i.addEventListener('change', () => aplicar(chave, i.value));
      input = i;
      if (lista) linhas.push(el('datalist', { id: lista }, ...acoes.map((a) => el('option', { value: a }))));
    }
    const lab = el('label', { for: id }, c.nome);
    dica(lab, c.nome, `${c.texto ? c.texto + ' ' : ''}Código: eu.campos.${chave}${c.tipo === 'acao' ? ' (ex.: eu.tocar(eu.campos.' + chave + '))' : ''}`);
    linhas.push(el('div', { class: 'campo largo' }, lab, input));
  }
  linhas.push(abrir);
  return linhas;
}
