/**
 * Visual Audit Script: Captures screenshots across viewports & screens in Edge
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWsUrl(port) {
  for (let i = 0; i < 25; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (data && data[0] && data[0].webSocketDebuggerUrl) {
        return data[0].webSocketDebuggerUrl;
      }
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('CDP target not found');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails.exception?.description);
    }
    return res.result ? res.result.value : null;
  }
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: width < 768
    });
  }
  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const edgeProc = spawn(edgePath, [
    '--remote-debugging-port=9224',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + path.join(__dirname, '.temp_edge_audit'),
    'http://localhost:3000'
  ]);

  try {
    const wsUrl = await getWsUrl(9224);
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await sleep(1200);

    // 1. Capture Landing Screen (Desktop & Mobile)
    await client.setViewport(1280, 800);
    await client.screenshot(path.join(outDir, '01_desktop_landing.png'));
    console.log('Captured: 01_desktop_landing.png');

    await client.setViewport(390, 844);
    await client.screenshot(path.join(outDir, '02_mobile_landing.png'));
    console.log('Captured: 02_mobile_landing.png');

    // 2. Create Football and populate sample data
    await client.eval(`
      (async () => {
        window.localStorage.clear();
        await Storage.init();
        await Storage.createFutebol({
          nome: 'Família do Fut Real',
          adminNome: 'Matheus Silva',
          email: 'matheus@futreal.com',
          password: 'senhaSegura123'
        });
        Jogadores.loadDemoPlayers();
        Sorteio.selecionarPrimeiros20();
        Sorteio.solicitarSorteio();
        Partidas.selectMatchup('time_1', 'time_2');
        Partidas.startOrResumeMatch();
        Partidas.state.remainingSeconds = 582; // 09:42
        Partidas.updateTimerDisplay();
        const teams = Storage.getTeams();
        if (teams) {
          Partidas.registrarGol('time_1', teams.time_1.players[0].id, teams.time_1.players[0].name);
          Partidas.registrarGol('time_2', teams.time_2.players[0].id, teams.time_2.players[0].name);
          Partidas.registrarGol('time_1', teams.time_1.players[1].id, teams.time_1.players[1].name);
        }
        App.updateHeaderUI();
        App.navigateTo('dashboard');
      })()
    `);
    await sleep(800);

    // 3. Desktop screens
    await client.setViewport(1280, 800);
    const desktopScreens = ['dashboard', 'jogadores', 'sorteio', 'partida', 'tabela', 'rankings', 'historico'];
    for (const s of desktopScreens) {
      await client.eval(`App.navigateTo('${s}')`);
      await sleep(350);
      await client.screenshot(path.join(outDir, `desktop_${s}.png`));
      console.log(`Captured: desktop_${s}.png`);
    }

    // 4. Mobile screens (390 x 844)
    await client.setViewport(390, 844);
    for (const s of desktopScreens) {
      await client.eval(`App.navigateTo('${s}')`);
      await sleep(350);
      await client.screenshot(path.join(outDir, `mobile_${s}.png`));
      console.log(`Captured: mobile_${s}.png`);
    }

    // 5. Mobile "Mais" Modal Sheet
    await client.eval(`Utils.openModal('modal-more-menu')`);
    await sleep(300);
    await client.screenshot(path.join(outDir, 'mobile_modal_more.png'));
    console.log('Captured: mobile_modal_more.png');

    client.close();
    console.log('Visual audit capture completed successfully!');
  } finally {
    try { edgeProc.kill('SIGKILL'); } catch {}
  }
}

run().catch(console.error);
