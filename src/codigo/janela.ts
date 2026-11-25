// Janela própria do painel de Código (Electron): pode ficar no segundo monitor enquanto o editor fica no primeiro.
// Recebe do editor, em tempo real, a lista do que existe (objetos, inimigos, personagens…) e o Log do teste.
import '../estilo.css';
import { LOG, capturarErrosGlobais } from '../core/log';
import { PlataformaElectron } from '../plataforma/electron';
import { aoReceber, enviar, type ElementoSerial } from '../plataforma/ponte';
import { PainelCodigo, type ElementoCodigo } from '../ui/codigo/painel';
import { Legendas } from '../ui/legenda';

capturarErrosGlobais();
new Legendas();
const plat = new PlataformaElectron();
const painel = new PainelCodigo(plat, { janela: true });

let lista: ElementoSerial[] = [];
let tipos = '';
let proximoId = 1;
const pendentes = new Map<number, (ok: boolean) => void>();

painel.registrarFonte(async () => lista.map((e): ElementoCodigo => ({
  ...e,
  ...(e.ligavel ? {
    ligar: (arquivo: string) => new Promise<boolean>((resolve) => {
      const id = proximoId++;
      pendentes.set(id, resolve);
      enviar('editor', { tipo: 'ligar', id, chave: e.chave, arquivo });
    }),
  } : {}),
})));
painel.tipos = async () => tipos;
painel.aoSalvarScript = (arquivo) => enviar('editor', { tipo: 'scriptSalvo', arquivo });
painel.aoTestar = () => enviar('editor', { tipo: 'testar' });
painel.aoAvisar = (m) => { painel.avisar(m); enviar('editor', { tipo: 'aviso', texto: m }); };

aoReceber((msg) => {
  switch (msg.tipo) {
    case 'elementos': lista = msg.lista; tipos = msg.tipos; void painel.atualizarElementos(); break;
    case 'foco': void painel.abrir(msg.chave); break;
    case 'irPara': void painel.irPara(msg.arquivo, msg.linha); break;
    case 'log': LOG.importar(msg.linha); break;
    case 'resposta': pendentes.get(msg.id)?.(msg.ok); pendentes.delete(msg.id); break;
    case 'scriptMudou': void painel.mudouPorFora(msg.arquivo); break;
  }
});
// O Claude (ou outro programa) mudou um script no disco
plat.aoMudarProjeto((m) => { if (m.tipo === 'script') void painel.mudouPorFora(m.nome); });

void painel.abrir().then(() => enviar('editor', { tipo: 'pronto' }));
