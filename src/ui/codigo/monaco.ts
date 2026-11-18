// Carrega o Monaco (o editor do VS Code) só quando o painel de Código abre: não pesa na abertura da engine.
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_id: string, rotulo: string) {
    return rotulo === 'typescript' || rotulo === 'javascript' ? new TsWorker() : new EditorWorker();
  },
};

// Tema com a paleta da Lorex
monaco.editor.defineTheme('lorex', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6f8a82', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'a7dd3e' },
    { token: 'string', foreground: 'f8b65a' },
    { token: 'number', foreground: '65da67' },
  ],
  colors: {
    'editor.background': '#121816',
    'editor.lineHighlightBackground': '#1b2421',
    'editorLineNumber.foreground': '#4d625b',
    'editorLineNumber.activeForeground': '#a7dd3e',
    'editorCursor.foreground': '#a7dd3e',
    'editor.selectionBackground': '#2ca78255',
    'editorIndentGuide.background1': '#222d2a',
    'editorWidget.background': '#18201e',
    'editorSuggestWidget.background': '#18201e',
    'editorSuggestWidget.selectedBackground': '#2b3835',
  },
});

const js = monaco.typescript.javascriptDefaults;
js.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  module: monaco.typescript.ModuleKind.ESNext,
  allowJs: true,
  checkJs: true,
  allowNonTsExtensions: true,
  noImplicitAny: false,
  strict: false,
  lib: ['es2020'],
});
js.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });

let libTipos: monaco.IDisposable | null = null;
/** Troca as declarações da API (chamado sempre que o contexto do projeto muda). */
export function definirTipos(dts: string) {
  libTipos?.dispose();
  libTipos = js.addExtraLib(dts, 'file:///lorex-api.d.ts');
}

export { monaco };
