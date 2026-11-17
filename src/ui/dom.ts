// Pequenos utilitários de DOM e diálogos (o Electron não suporta prompt()/confirm() nativos).

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  ...filhos: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = String(v);
    else if (typeof v === 'boolean') { if (v) e.setAttribute(k, ''); }
    else e.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f !== null && f !== undefined) e.append(f);
  return e;
}

function modal(conteudo: HTMLElement): { fechar: () => void } {
  const fundo = el('div', { class: 'modal-fundo' }, el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, conteudo));
  document.body.append(fundo);
  return { fechar: () => fundo.remove() };
}

/** Pede um texto ao usuário. Retorna null se cancelar. */
export function pedirTexto(titulo: string, rotulo: string, valor: string, botao = 'Criar'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value: valor, id: 'dlg-texto' });
    const ok = el('button', { class: 'primario', type: 'submit' }, botao);
    const cancelar = el('button', { type: 'button' }, 'Cancelar');
    const form = el('form', {},
      el('h2', {}, titulo),
      el('label', { for: 'dlg-texto' }, rotulo),
      input,
      el('div', { class: 'modal-acoes' }, cancelar, ok));
    const m = modal(form);
    const fim = (v: string | null) => { m.fechar(); resolve(v); };
    form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); fim(t || null); });
    cancelar.addEventListener('click', () => fim(null));
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') fim(null); });
    setTimeout(() => { input.focus(); input.select(); });
  });
}

/** Pergunta com botões. Retorna o índice do botão escolhido (-1 = Esc). */
export function perguntar(titulo: string, texto: string, botoes: string[]): Promise<number> {
  return new Promise((resolve) => {
    const acoes = el('div', { class: 'modal-acoes' });
    const caixa = el('div', {}, el('h2', {}, titulo), el('p', {}, texto), acoes);
    const m = modal(caixa);
    const fim = (i: number) => { m.fechar(); document.removeEventListener('keydown', esc, true); resolve(i); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fim(-1); } };
    document.addEventListener('keydown', esc, true);
    botoes.forEach((b, i) => {
      const bt = el('button', { type: 'button', class: i === botoes.length - 1 ? 'primario' : '' }, b);
      bt.addEventListener('click', () => fim(i));
      acoes.append(bt);
    });
    setTimeout(() => (acoes.lastElementChild as HTMLElement | null)?.focus());
  });
}
