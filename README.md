# ⚽ Família do Fut — Aplicativo de Organização de Futebol

Aplicativo web completo (Web App / PWA) desenvolvido em **HTML5**, **CSS3 moderno** e **JavaScript puro (Vanilla JS)** para organização de partidas de futebol entre amigos.

---

## 🌟 Funcionalidades Principais

1. **Dashboard Esportivo**:
   - Resumo em tempo real de atletas cadastrados, partidas jogadas hoje, gols marcados hoje, líder da tabela do dia, artilheiro geral e líder do Ranking de Capa.
   - Acesso rápido para sorteio ou controle de partidas.

2. **Cadastro e Classificação de Jogadores**:
   - Cadastro ágil com nome e avaliação de nível de **1 a 5 estrelas** (⭐ a ⭐⭐⭐⭐⭐).
   - Edição, exclusão e alteração rápida de estrelas nos cards.
   - Filtro por estrelas e busca em tempo real por nome.
   - **Botão "Carregar 20 de Exemplo"**: carrega instantaneamente 20 jogadores balanceados nas 5 faixas de estrelas para testes imediatos.

3. **Sorteio Equilibrado de 4 Equipes (5 Jogadores por Time)**:
   - Sempre **4 times** (Time 1, Time 2, Time 3 e Time 4) com exatamente **5 jogadores cada** (20 jogadores).
   - **Algoritmo de Otimização Combinatória**:
     - Minimiza a diferença entre a maior e a menor soma de estrelas dos times.
     - Distribui jogadores de 5 estrelas evitando concentração excessiva.
     - Evita acúmulo de jogadores de 1 ou 2 estrelas em um mesmo time.
     - Exibe a soma de estrelas de cada equipe e a diferença final máx/mín.
   - **Identificação Visual por Cores Configuráveis**:
     - Seletor de cor (*Color Picker*) independente para cada um dos 4 times.
     - Cores refletidas dinamicamente em toda a interface: cards, placar, cronômetro, tabela e histórico.
   - **Novo Sorteio**:
     - Botão com confirmação que gera novas equipes mantendo todo o histórico de partidas e rankings salvos.

4. **Controle de Partida em Tempo Real**:
   - **Confrontos organizados**: Primeira partida obrigatoriamente **Time 1 x Time 2**, seguida da sequência recomendada (Time 3 x Time 4, Time 1 x Time 3, Time 2 x Time 4, Time 1 x Time 4, Time 2 x Time 3).
   - **Cronômetro Regressivo**: 5, 10, 15, 20, 30 min ou personalizado, com funções Iniciar, Pausar e Finalizar. Encerramento automático ao atingir 00:00.
   - **Placar Interativo em Tempo Real**:
     - Botões de **+ GOL** rápidos com seleção direta do autor entre os jogadores do time.
     - Registro de minuto, data, hora, jogador e equipe.
     - Efeitos visuais e sonoros festivos (Web Audio API sem dependências externas).
   - **Linha do Tempo e Correção de Gols**:
     - Lista todos os gols da partida.
     - Botão de exclusão para corrigir lançamentos errados com recálculo instantâneo do placar e estatísticas.

5. **Tabela do Dia (Classificação Diária)**:
   - Considera exclusivamente as partidas da data atual.
   - Pontuação: **Vitória = 3 pts**, **Empate = 1 pt**, **Derrota = 0 pts**.
   - Colunas completas: **J, V, E, D, GP, GC, SG, PTS**.
   - Critérios de desempate: Pontos > Saldo de Gols > Gols Marcados > Menor Gols Contra.
   - Exibição das partidas finalizadas no dia logo abaixo da tabela.

6. **Rankings Gerais**:
   - **⚽ Artilharia**: Ranking de gols geral histórico com medalhas (🥇 1º, 🥈 2º, 🥉 3º), contagem de gols e estrelas.
   - **👑 Ranking de Capa**: Quando uma equipe vence uma partida, **cada um dos 5 jogadores da equipe vencedora ganha +1 ponto de Capa** (empates e derrotas não pontuam).

7. **Histórico Permanente**:
   - Visualização de todas as partidas já disputadas agrupadas por data.
   - Exibe placar, cores dos times, resultado ("Time X venceu" ou "Empate"), duração e lista de autores de gols com minuto.
   - Preservado mesmo após novos sorteios.

8. **Camada de Dados & Persistência**:
   - Módulo `storage.js` isolado utilizando `localStorage`.
   - Eventos reativos internos para atualização em tempo real entre módulos.
   - Opção de **Resetar Dados** com dupla confirmação de segurança.
   - Estrutura pronta para plugar banco de dados (ex: Supabase, Firebase ou API REST).

---

## 📁 Estrutura do Projeto

```
/
├── index.html              # Interface do usuário (SPA)
├── manifest.json           # Configuração PWA
├── server.js               # Servidor local Node.js (zero dependências)
├── test_app.js             # Bateria de testes automatizados (26 asserções)
├── css/
│   ├── style.css           # Design system e estilização esportiva moderna
│   └── responsive.css      # Regras responsivas (Mobile, Tablet, Desktop)
├── js/
│   ├── app.js              # Inicializador e roteador das telas
│   ├── storage.js          # Camada abstrata de persistência
│   ├── utils.js            # Utilitários, modais, toasts e síntese sonora
│   ├── jogadores.js        # Gestão de jogadores e estrelas
│   ├── sorteio.js          # Algoritmo de sorteio equilibrado e cores
│   ├── partidas.js         # Cronômetro, placar, gols e confrontos
│   ├── tabela.js           # Classificação e pontuação do dia
│   ├── rankings.js         # Rankings de Artilharia e Capa
│   └── historico.js        # Histórico de confrontos realizados
└── assets/
    └── icons/
        └── icon.svg        # Ícone do aplicativo
```

---

## 🚀 Como Executar

### Opção 1: Com Node.js (Recomendado)
No terminal, dentro da pasta do projeto:
```bash
node server.js
```
Acesse no navegador:
👉 **`http://localhost:3000`**

### Opção 2: Abrindo Diretamente ou com Qualquer Servidor Estático
Por utilizar módulos JavaScript modernos (`<script type="module">`), é recomendado executar via servidor HTTP local (como o `server.js` incluso, ou extensões como *Live Server* do VS Code).

---

## 🧪 Como Executar as Baterias de Testes

Para validar automaticamente todas as regras de negócio, responsividade, multi-tenancy, modelo Quem Ganha Fica, tabela por rodada e migração de dados históricos:

```bash
# 1. Testes de Estrelas dos Jogadores Sempre Editáveis (13 passos e 29 verificações)
node test_estrelas_sempre_editaveis.js

# 2. Testes de Migração de Dados Históricos Iniciais (20 requisitos e 61 verificações)
node test_historico_inicial.js

# 3. Testes de Tabela por Rodada / Noite (45 verificações)
node test_tabela_por_rodada.js

# 4. Testes do Modelo Quem Ganha Fica e Regra de Empate (35 verificações)
node test_regra_empate.js

# 5. Testes da Plataforma Multi-Futebol e Isolamento RLS (30 verificações)
node test_multi_futebol.js

# 6. Testes de Responsividade em Todos os Breakpoints (11 verificações)
node test_breakpoints.js
```

---

## ⭐ Regra das Estrelas dos Jogadores

As estrelas representam a avaliação técnica e nível atual de cada jogador (1 a 5 estrelas) para o algoritmo de balanceamento de times:
- **Permanentemente Editáveis pelo Administrador:**
  - O campo de estrelas permanece sempre disponível para edição pelo administrador: antes, durante e após a carga histórica, assim como durante rodadas ativas ou após rodadas encerradas.
  - O fechamento da carga histórica inicial (`historico_inicial_aberto = false`) bloqueia **exclusivamente** os campos `gols_historicos_iniciais` e `capas_historicas_iniciais`, **nunca** bloqueando as estrelas.
- **Formas de Edição na Interface:**
  - Seletor interativo de estrelas no formulário de edição;
  - Dropdown direto por jogador (`1 a 5 estrelas`);
  - Botões rápidos de incremento (`+`) e decremento (`-`);
  - Ícones SVG minimalistas (sem emojis), em conformidade com o padrão visual do FutRoda.
- **Segurança e RLS:**
  - Somente o Administrador autenticado do respectivo `futebol_id` pode alterar as estrelas.
  - Usuários públicos em modo somente leitura podem visualizar as estrelas, mas são estritamente impedidos de editá-las (protegido por `assertAdmin` no frontend e validação de RLS no Supabase).

---

## 📊 Migração de Dados Históricos Iniciais

Para campeonatos que já estavam em andamento antes da adoção do FutRoda:
- **Conceito de Saldo Inicial:** Permite cadastrar uma única vez os gols marcados e Capas conquistadas anteriormente (`gols_historicos_iniciais` e `capas_historicas_iniciais`).
- **Fórmulas Cumulativas:**
  - $\text{Gols Totais} = \text{Gols Históricos Iniciais} + \text{Gols Registrados pelo FutRoda}$
  - $\text{Capas Totais} = \text{Capas Históricas Iniciais} + \text{Capas Conquistadas no FutRoda}$
- **Fechamento e Bloqueio Definitivo:**
  - Enquanto `historico_inicial_aberto = true`, o administrador pode salvar e ajustar os valores.
  - Ao clicar em "FINALIZAR CARGA HISTÓRICA", um modal de confirmação é exibido.
  - Uma vez confirmado, `historico_inicial_aberto = false` é persistido no Supabase e os campos são bloqueados para edição na interface e protegidos por RLS/triggers no backend.
- **Novos Jogadores:** Jogadores cadastrados após o fechamento entram obrigatoriamente com 0 gols e 0 Capas históricas, sem reabrir a carga.
- **Isolamento da Tabela:** A tabela de classificação dos times permanece estritamente por rodada/noite (inicia zerada a cada noite) e nunca é afetada pelos dados históricos individuais dos atletas.
