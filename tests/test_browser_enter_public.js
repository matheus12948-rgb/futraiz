/**
 * TESTE E2E NO MICROSOFT EDGE: ENTRADA EM FUTEBOL PELO CÓDIGO PÚBLICO
 * Testa o fluxo real no navegador:
 * 1. Abrir Modal "Entrar em um Futebol"
 * 2. Digitar código com espaços e letras minúsculas: "   fdt-h7g3   "
 * 3. Clicar em "Acessar"
 * 4. Verificar fechamento automático do modal em sucesso
 * 5. Verificar atualização da URL para #/fut/FDT-H7G3
 * 6. Verificar carregamento dos dados do futebol "Futzin" (c2ec6306-5757-41ec-9b5f-1a0637272036)
 * 7. Verificar badge de Espectador Público / Somente Leitura
 * 8. Testar código inválido "FDT-XXXX" e verificar mensagem amigável de erro
 */

import { spawn } from 'child_process';
import http from 'http';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port = 9222) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || list[0];
          if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('No page target found'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception.description || 'Evaluation error');
    }
    return res.result.value;
  }
}

let passed = 0;
let failed = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('TESTES E2E NO NAVEGADOR EDGE: ENTRAR EM FUTEBOL (CÓDIGO PÚBLICO)');
  console.log('================================================================\n');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_enter_profile_' + Date.now();

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      wsUrl = await getDebuggerUrl(9222);
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Falha ao conectar no Edge na porta 9222');
  }

  const client = new CDPClient(wsUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  await sleep(1500);

  // 1. Verificar tela inicial landing
  const initialLanding = await client.eval(`
    document.getElementById('screen-landing').classList.contains('active')
  `);
  assert(initialLanding, 'Tela landing visível inicialmente');

  // 2. Abrir modal "Entrar em um futebol"
  await client.eval(`
    document.getElementById('btn-open-enter-futebol').click();
  `);
  await sleep(400);

  const modalOpen = await client.eval(`
    document.getElementById('modal-enter-futebol').classList.contains('active')
  `);
  assert(modalOpen, 'Modal "Entrar em um futebol" aberto com sucesso');

  // 3. Inserir código com espaços e letras minúsculas: "   fdt-h7g3   "
  console.log('\n--- Submetendo código com espaços e minúsculas: "   fdt-h7g3   " ---');
  await client.eval(`
    (() => {
      const input = document.getElementById('enter-fut-code');
      input.value = '   fdt-h7g3   ';
      document.getElementById('form-enter-futebol').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    })()
  `);

  // Espera a submissão terminar (botão liberado)
  await client.eval(`
    new Promise((resolve) => {
      const check = () => {
        const btn = document.getElementById('btn-submit-enter-fut');
        if (btn && !btn.disabled) resolve();
        else setTimeout(check, 100);
      };
      setTimeout(check, 200);
    })
  `);
  await sleep(500);

  // 4. Verificar se o modal fechou automaticamente após o sucesso
  const modalClosed = await client.eval(`
    !document.getElementById('modal-enter-futebol').classList.contains('active')
  `);
  assert(modalClosed, 'Modal fechou automaticamente após entrar no futebol');

  // 5. Verificar se a URL mudou para o código oficial
  const currentHash = await client.eval(`window.location.hash`);
  assert(currentHash === '#/fut/FDT-H7G3', `URL atualizada para "#/fut/FDT-H7G3" (atual: "${currentHash}")`);

  // 6. Verificar se os dados do futebol carregado no Storage estão corretos
  const futState = await client.eval(`
    (() => {
      const fut = window.Storage.currentFutebol;
      return {
        hasFut: !!fut,
        id: fut ? fut.id : null,
        codigo_publico: fut ? fut.codigo_publico : null,
        nome: fut ? fut.nome : null,
        isPublic: window.Storage.isPublicViewer(),
        userRole: window.Storage.userRole
      };
    })()
  `);
  assert(futState.hasFut, 'Futebol carregado no estado da aplicação');
  assert(futState.codigo_publico === 'FDT-H7G3', `codigo_publico é FDT-H7G3 (atual: ${futState.codigo_publico})`);
  assert(futState.id === 'c2ec6306-5757-41ec-9b5f-1a0637272036', `UUID interno preservado: ${futState.id}`);
  assert(futState.isPublic && futState.userRole === 'PUBLIC_VIEWER', 'Modo PUBLIC_VIEWER ativo');

  // 7. Testar tentativa com código inexistente
  console.log('\n--- Testando código inexistente: "FDT-XXXX" ---');
  await client.eval(`
    document.getElementById('btn-open-enter-futebol').click();
  `);
  await sleep(300);

  await client.eval(`
    (() => {
      const input = document.getElementById('enter-fut-code');
      input.value = 'FDT-XXXX';
      document.getElementById('form-enter-futebol').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    })()
  `);

  await client.eval(`
    new Promise((resolve) => {
      const check = () => {
        const btn = document.getElementById('btn-submit-enter-fut');
        if (btn && !btn.disabled) resolve();
        else setTimeout(check, 100);
      };
      setTimeout(check, 200);
    })
  `);
  await sleep(500);

  const errorState = await client.eval(`
    (() => {
      const toasts = Array.from(document.querySelectorAll('.toast'));
      const toast = toasts[toasts.length - 1];
      const modalOpen = document.getElementById('modal-enter-futebol').classList.contains('active');
      return {
        toastText: toast ? toast.textContent : '',
        modalOpen
      };
    })()
  `);
  assert(errorState.modalOpen, 'Modal permanece aberto após código inválido para usuário corrigir');
  assert(
    errorState.toastText.includes('não encontrado') || errorState.toastText.includes('Verifique o código'),
    `Toast de erro amigável exibido: "${errorState.toastText}"`
  );

  // Finalização
  await client.eval(`
    document.querySelector('#modal-enter-futebol [data-close]').click();
  `);
  await sleep(300);

  edgeProc.kill();

  console.log('================================================================');
  console.log(`RESULTADO FINAL E2E EDGE: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Erro na execução do teste E2E:', err);
  process.exit(1);
});
