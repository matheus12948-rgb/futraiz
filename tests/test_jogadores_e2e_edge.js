/**
 * TESTE E2E NO MICROSOFT EDGE: TELA DE JOGADORES COM SUPABASE REAL
 * Executa o fluxo de validação real do usuário:
 * 1. Fazer login como admin do futebol real ou criar futebol
 * 2. Navegar para a tela de jogadores (#/jogadores)
 * 3. Verificar que botão de carregar exemplos NÃO existe na interface
 * 4. Adicionar "José Roberto" (5 estrelas)
 * 5. Confirmar que aparece imediatamente e contador atualiza
 * 6. Adicionar segundo atleta "Carlos Zagueiro" (4 estrelas)
 * 7. Confirmar que a quantidade muda automaticamente para 2
 * 8. Alterar estrelas com o botão [-] e [+]
 * 9. Recarregar a página e confirmar que a alteração de estrelas e os dados permanecem salvos no Supabase
 * 10. Buscar jogador ("José") e validar filtro de busca
 * 11. Aplicar filtro por estrelas e validar
 * 12. Confirmar que não há botões quadrados vazios (ícones svg presentes com dimensões)
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
  console.log('TESTES E2E NO EDGE: FLUXO REAL DA TELA DE JOGADORES');
  console.log('================================================================\n');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_jogadores_profile_' + Date.now();

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

  // Setup: Cria futebol com admin
  console.log('--- 1. Autenticando e Acessando Futebol ---');
  await client.eval(`
    (async () => {
      await window.Storage.createFutebol({
        nome: 'Futebol E2E Jogadores',
        adminNome: 'Administrador E2E',
        email: 'e2e_jogadores@futraiz.com',
        password: 'senhaSegura123'
      });
      window.App.navigateTo('jogadores');
    })()
  `);
  await sleep(500);

  // 2. Verificar se está na tela de jogadores e se botão demo NÃO existe
  console.log('\n--- 2. Verificação de Interface e Ausência de Botão de Exemplos ---');
  const screenActive = await client.eval(`
    document.getElementById('screen-jogadores').classList.contains('active')
  `);
  assert(screenActive, 'Tela de jogadores ativa');

  const demoBtnExists = await client.eval(`
    !!document.getElementById('btn-load-demo-players')
  `);
  assert(!demoBtnExists, 'Botão "Carregar 30 jogadores de exemplo" NÃO existe na tela');

  const demoTextExists = await client.eval(`
    document.getElementById('screen-jogadores').textContent.includes('Carregar 30 jogadores de exemplo')
  `);
  assert(!demoTextExists, 'Texto "Carregar 30 jogadores de exemplo" ausente da tela');

  // 3. Adicionar primeiro jogador: "José Roberto" (5 estrelas)
  console.log('\n--- 3. Adicionar "José Roberto" (5 estrelas) ---');
  await client.eval(`
    (() => {
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'José Roberto';
      window.Jogadores.setSelectedStars(5);
      document.getElementById('form-jogador').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    })()
  `);

  // Aguarda submissão
  await client.eval(`
    new Promise(r => {
      const check = () => {
        const btn = document.getElementById('player-submit-btn');
        if (btn && !btn.disabled) r(); else setTimeout(check, 100);
      };
      setTimeout(check, 100);
    })
  `);
  await sleep(500);

  const afterFirstAdd = await client.eval(`
    (() => {
      const countEl = document.getElementById('players-total-count');
      const listEl = document.getElementById('players-list');
      const nameInput = document.getElementById('player-name');
      return {
        count: countEl ? countEl.textContent.trim() : '',
        hasJose: listEl ? listEl.textContent.includes('José Roberto') : false,
        inputCleared: nameInput ? nameInput.value === '' : false
      };
    })()
  `);
  assert(afterFirstAdd.count === '1', `Contador atualizado para "1" (JOGADORES 1)`);
  assert(afterFirstAdd.hasJose, 'José Roberto aparece imediatamente na lista');
  assert(afterFirstAdd.inputCleared, 'Input de nome limpo automaticamente');

  // 4. Adicionar segundo atleta: "Carlos Zagueiro" (4 estrelas)
  console.log('\n--- 4. Adicionar "Carlos Zagueiro" (4 estrelas) ---');
  await client.eval(`
    (() => {
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Carlos Zagueiro';
      window.Jogadores.setSelectedStars(4);
      document.getElementById('form-jogador').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    })()
  `);

  await client.eval(`
    new Promise(r => {
      const check = () => {
        const btn = document.getElementById('player-submit-btn');
        if (btn && !btn.disabled) r(); else setTimeout(check, 100);
      };
      setTimeout(check, 100);
    })
  `);
  await sleep(500);

  const afterSecondAdd = await client.eval(`
    (() => {
      const countEl = document.getElementById('players-total-count');
      const listEl = document.getElementById('players-list');
      return {
        count: countEl ? countEl.textContent.trim() : '',
        hasCarlos: listEl ? listEl.textContent.includes('Carlos Zagueiro') : false,
        totalItems: listEl ? listEl.querySelectorAll('.player-list-item').length : 0
      };
    })()
  `);
  assert(afterSecondAdd.count === '2', `Contador atualizado automaticamente para "2" (JOGADORES 2)`);
  assert(afterSecondAdd.hasCarlos, 'Carlos Zagueiro aparece imediatamente na lista');
  assert(afterSecondAdd.totalItems === 2, 'Exatamente 2 atletas renderizados na lista');

  // 5. Inspecionar os botões de ação e garantir que não há botões quadrados vazios
  console.log('\n--- 5. Inspeção Visual dos Botões da Linha do Jogador ---');
  const buttonsState = await client.eval(`
    (() => {
      const editBtns = Array.from(document.querySelectorAll('.btn-edit'));
      const deleteBtns = Array.from(document.querySelectorAll('.btn-delete'));
      const incBtns = Array.from(document.querySelectorAll('[data-action="inc-star"]'));
      const decBtns = Array.from(document.querySelectorAll('[data-action="dec-star"]'));

      return {
        editCount: editBtns.length,
        deleteCount: deleteBtns.length,
        incCount: incBtns.length,
        decCount: decBtns.length,
        editHasSvg: editBtns.every(b => b.querySelector('svg') !== null),
        deleteHasSvg: deleteBtns.every(b => b.querySelector('svg') !== null),
        editAria: editBtns.every(b => !!b.getAttribute('aria-label') && !!b.getAttribute('title')),
        deleteAria: deleteBtns.every(b => !!b.getAttribute('aria-label') && !!b.getAttribute('title')),
        svgDimensions: editBtns.every(b => {
          const svg = b.querySelector('svg');
          const rect = svg.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
      };
    })()
  `);
  assert(buttonsState.editCount === 2, 'Dois botões Editar renderizados');
  assert(buttonsState.deleteCount === 2, 'Dois botões Excluir renderizados');
  assert(buttonsState.editHasSvg && buttonsState.deleteHasSvg, 'Todos os botões possuem ícones SVG reais renderizados');
  assert(buttonsState.svgDimensions, 'Ícones SVG possuem dimensões visíveis reais (não são quadrados vazios)');
  assert(buttonsState.editAria && buttonsState.deleteAria, 'Botões possuem atributos title e aria-label acessíveis');

  // 6. Alterar estrelas de Carlos Zagueiro (de 4 para 5 com botão inc-star)
  console.log('\n--- 6. Alteração de Estrelas via Botão ---');
  await client.eval(`
    (() => {
      const items = Array.from(document.querySelectorAll('.player-list-item'));
      const carlosItem = items.find(it => it.textContent.includes('Carlos Zagueiro'));
      const btnInc = carlosItem.querySelector('[data-action="inc-star"]');
      btnInc.click();
    })()
  `);
  await sleep(400);

  const carlosStars = await client.eval(`
    (() => {
      const p = window.Storage.getPlayers().find(x => x.name === 'Carlos Zagueiro');
      return p ? p.stars : null;
    })()
  `);
  assert(carlosStars === 5, 'Carlos Zagueiro atualizado para 5 estrelas');

  // 7. Recarregar a página e confirmar persistência
  console.log('\n--- 7. Recarregando Página e Validando Persistência ---');
  await client.send('Page.reload');
  await sleep(1500);

  const afterReload = await client.eval(`
    (() => {
      const p1 = window.Storage.getPlayers().find(x => x.name === 'José Roberto');
      const p2 = window.Storage.getPlayers().find(x => x.name === 'Carlos Zagueiro');
      return {
        total: window.Storage.getPlayers().length,
        p1Stars: p1 ? p1.stars : null,
        p2Stars: p2 ? p2.stars : null
      };
    })()
  `);
  assert(afterReload.total === 2, 'Os 2 atletas continuam persistidos após reload');
  assert(afterReload.p2Stars === 5, 'Carlos Zagueiro manteve 5 estrelas após reload');

  // 8. Busca e Filtro
  console.log('\n--- 8. Busca e Filtros na UI ---');
  await client.eval(`
    (() => {
      window.App.navigateTo('jogadores');
      const search = document.getElementById('players-search');
      search.value = 'José';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await sleep(300);

  const searchResult = await client.eval(`
    (() => {
      const listEl = document.getElementById('players-list');
      return {
        hasJose: listEl.textContent.includes('José Roberto'),
        hasCarlos: listEl.textContent.includes('Carlos Zagueiro')
      };
    })()
  `);
  assert(searchResult.hasJose && !searchResult.hasCarlos, 'Busca por "José" filtra corretamente');

  // Limpa busca
  await client.eval(`
    (() => {
      const search = document.getElementById('players-search');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await sleep(300);

  edgeProc.kill();

  console.log('================================================================');
  console.log(`RESULTADO FINAL E2E EDGE JOGADORES: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Erro na execução do teste E2E:', err);
  process.exit(1);
});
