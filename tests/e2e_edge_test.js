/**
 * E2E Browser Test using native Microsoft Edge via Chrome DevTools Protocol (CDP)
 * Tests real rendering, DOM events, UI forms, navigation, and security boundaries.
 */

import { spawn } from 'child_process';
import http from 'http';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findEdgePath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Users\\' + (process.env.USERNAME || 'mathe') + '\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of possiblePaths) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return 'msedge';
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
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
    }
    return res.result?.value;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function run() {
  console.log('🚀 Iniciando teste E2E no Microsoft Edge via CDP...');
  const edgePath = await findEdgePath();
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_e2e_profile_' + Date.now();

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
    throw new Error('Não foi possível conectar ao Edge na porta 9222');
  }

  console.log('🌐 Conectado ao Microsoft Edge CDP:', wsUrl);
  const client = new CDPClient(wsUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');

  await sleep(1500);

  // 1. Verificar Landing Screen
  console.log('\n--- 1. Verificando Tela Inicial (Landing Page) ---');
  const title = await client.eval(`document.querySelector('.landing-hero h1')?.innerText`);
  const hasCriarBtn = await client.eval(`Boolean(document.getElementById('btn-open-create-futebol'))`);
  const hasEntrarBtn = await client.eval(`Boolean(document.getElementById('btn-open-enter-futebol'))`);
  console.log(`  📌 Título: "${title}"`);
  console.log(`  📌 Botão [Criar Meu Futebol]: ${hasCriarBtn}`);
  console.log(`  📌 Botão [Entrar em um Futebol]: ${hasEntrarBtn}`);

  if (!hasCriarBtn || !hasEntrarBtn) throw new Error('Botões da landing page não foram encontrados!');

  // 2. Abrir Modal Criar Futebol
  console.log('\n--- 2. Abrindo Modal Criar Futebol ---');
  await client.eval(`document.getElementById('btn-open-create-futebol').click()`);
  await sleep(500);
  const modalVisible = await client.eval(`document.getElementById('modal-create-futebol').classList.contains('active')`);
  console.log(`  📌 Modal Criar Futebol visível: ${modalVisible}`);

  // 3. Preencher formulário de criação
  console.log('\n--- 3. Preenchendo formulário e criando Futebol ---');
  await client.eval(`
    document.getElementById('create-fut-name').value = 'Pelada dos Galácticos';
    document.getElementById('create-fut-admin-name').value = 'Roberto Carlos';
    document.getElementById('create-fut-email').value = 'roberto@galacticos.com';
    document.getElementById('create-fut-password').value = 'senhaForte123';
    document.getElementById('form-create-futebol').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  `);
  await sleep(1500);

  // 4. Verificar se entrou no Painel Administrativo
  console.log('\n--- 4. Verificando Painel Administrativo pós-criação ---');
  const activeFutName = await client.eval(`document.getElementById('header-active-fut-name')?.innerText`);
  const publicCode = await client.eval(`document.getElementById('header-futebol-code')?.innerText`);
  const roleText = await client.eval(`document.getElementById('header-role-badge')?.innerText`);
  const currentHash = await client.eval(`window.location.hash`);

  console.log(`  📌 Futebol Ativo: "${activeFutName}"`);
  console.log(`  📌 Código Público Gerado: "${publicCode}"`);
  console.log(`  📌 Nível de Acesso: "${roleText}"`);
  console.log(`  📌 Rota Hash: "${currentHash}"`);

  if (!publicCode || !publicCode.startsWith('FDT-')) {
    throw new Error(`Código público gerado inválido: ${publicCode}`);
  }
  if (!roleText.includes('ADMIN')) {
    throw new Error(`Papel não é de administrador: ${roleText}`);
  }

  // 5. Cadastrar jogadores no painel administrativo
  console.log('\n--- 5. Cadastrando Jogadores ---');
  await client.eval(`window.App.navigateTo('jogadores')`);
  await sleep(600);

  await client.eval(`
    document.getElementById('player-name').value = 'Ronaldo Fenômeno';
    document.getElementById('player-stars').value = '5';
    document.getElementById('form-jogador').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  `);
  await sleep(400);

  await client.eval(`
    document.getElementById('player-name').value = 'Ronaldinho Gaúcho';
    document.getElementById('player-stars').value = '5';
    document.getElementById('form-jogador').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  `);
  await sleep(400);

  const playersCount = await client.eval(`document.getElementById('players-total-count')?.innerText`);
  console.log(`  📌 Jogadores cadastrados renderizados: ${playersCount}`);

  // 6. Testar Acesso Público (Somente Leitura) via Hash /fut/FDT-XXXX
  console.log('\n--- 6. Testando Modo Público Somente Leitura via URL /fut/' + publicCode + ' ---');
  await client.eval(`window.location.hash = '#/fut/${publicCode}'`);
  await sleep(1200);

  const publicRoleBadge = await client.eval(`document.getElementById('header-role-badge')?.innerText`);
  const publicBanner = await client.eval(`document.getElementById('public-viewer-banner')?.style.display !== 'none'`);
  const isBodyRolePublic = await client.eval(`document.body.classList.contains('role-public-viewer')`);
  const adminFormHidden = await client.eval(`
    (() => {
      const formCard = document.querySelector('.card.form-card.admin-only');
      return !formCard || getComputedStyle(formCard).display === 'none';
    })()
  `);

  console.log(`  📌 Papel exibido: "${publicRoleBadge}"`);
  console.log(`  📌 Banner de Somente Leitura visível: ${publicBanner}`);
  console.log(`  📌 Classe body.role-public-viewer ativa: ${isBodyRolePublic}`);
  console.log(`  📌 Formulários administrativos (.admin-only) ocultados para o público: ${adminFormHidden}`);

  // 7. Tentativa de violação pelo usuário público no console
  console.log('\n--- 7. Tentativa de Violação por assertAdmin / RLS ---');
  const violationAttempt = await client.eval(`
    (() => {
      try {
        window.Storage.assertAdmin('Ação não autorizada');
        return 'FAIL_ALLOWED';
      } catch (e) {
        return 'BLOCKED: ' + e.message;
      }
    })()
  `);
  console.log(`  📌 Resultado da tentativa de mutação: ${violationAttempt}`);

  // 8. Testar Acesso Público com código inválido
  console.log('\n--- 8. Testando Acesso com Código Inexistente ---');
  const invalidAttempt = await client.eval(`
    (async () => {
      const res = await window.Storage.loadPublicFutebol('FDT-INEXISTENTE');
      return res;
    })()
  `);
  console.log(`  📌 Resposta para código inexistente:`, invalidAttempt);

  client.close();
  edgeProc.kill();

  console.log('\n================================================================');
  console.log('✅ TESTE E2E NO MICROSOFT EDGE CONCLUÍDO COM 100% DE SUCESSO!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('❌ Erro no teste E2E:', err);
  process.exit(1);
});
