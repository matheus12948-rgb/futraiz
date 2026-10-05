-- ==============================================================================
-- FAMÍLIA DO FUT — ESQUEMA COMPLETO MULTI-FUTEBOL COM ROW LEVEL SECURITY (RLS)
-- Plataforma Multi-Tenant com isolamento total entre futebóis e acesso público read-only
-- ==============================================================================

-- 1. Habilitar extensão para geração de UUID v4
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELA: futebois (Entidade Raiz de cada Futebol)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.futebois (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_publico TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    default_match_duration_seconds INT DEFAULT 420 NOT NULL,
    historico_inicial_aberto BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Migração segura para instâncias existentes
ALTER TABLE public.futebois ADD COLUMN IF NOT EXISTS default_match_duration_seconds INT DEFAULT 420;
ALTER TABLE public.futebois ADD COLUMN IF NOT EXISTS historico_inicial_aberto BOOLEAN DEFAULT true;

-- ==============================================================================
-- 3. TABELA: futebol_admins (Associação de Administradores por Futebol)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.futebol_admins (
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (futebol_id, user_id)
);

-- ==============================================================================
-- 4. TABELA: jogadores (Cadastro Permanente de Atletas por Futebol)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.jogadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    estrelas INT NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
    gols_historicos_iniciais INT DEFAULT 0 NOT NULL CHECK (gols_historicos_iniciais >= 0),
    capas_historicas_iniciais INT DEFAULT 0 NOT NULL CHECK (capas_historicas_iniciais >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.jogadores ADD COLUMN IF NOT EXISTS gols_historicos_iniciais INT DEFAULT 0;
ALTER TABLE public.jogadores ADD COLUMN IF NOT EXISTS capas_historicas_iniciais INT DEFAULT 0;

-- ==============================================================================
-- 5. TABELA: rodadas (Conceito de Domingo/Edição do Futebol)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.rodadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    numero INT DEFAULT 1 NOT NULL,
    data DATE DEFAULT CURRENT_DATE NOT NULL,
    status TEXT DEFAULT 'PLANNING' NOT NULL, -- 'PLANNING', 'READY', 'ACTIVE', 'FINISHED'
    campeao_time_id TEXT,
    campeao_time_nome TEXT,
    programacao JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 6. TABELA: rodada_jogadores (Os 20 atletas selecionados para a rodada)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.rodada_jogadores (
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (rodada_id, jogador_id)
);

-- ==============================================================================
-- 7. TABELA: times (Os 4 times sorteados de cada rodada)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    numero INT NOT NULL CHECK (numero BETWEEN 1 AND 4),
    nome TEXT NOT NULL,
    cor TEXT NOT NULL,
    total_estrelas INT DEFAULT 0 NOT NULL
);

-- ==============================================================================
-- 8. TABELA: time_jogadores (5 jogadores por time)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.time_jogadores (
    time_id UUID REFERENCES public.times(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (time_id, jogador_id)
);

-- ==============================================================================
-- 9. TABELA: partidas (Histórico oficial de partidas realizadas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE SET NULL,
    time_casa_id TEXT NOT NULL,
    time_fora_id TEXT NOT NULL,
    time_casa_nome TEXT NOT NULL,
    time_fora_nome TEXT NOT NULL,
    placar_casa INT DEFAULT 0 NOT NULL,
    placar_fora INT DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'finalizada' NOT NULL,
    tempo_segundos INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 10. TABELA: partida_ao_vivo (Sincronização em tempo real da partida atual)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partida_ao_vivo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL UNIQUE,
    time_casa_nome TEXT DEFAULT 'Time 1' NOT NULL,
    time_fora_nome TEXT DEFAULT 'Time 2' NOT NULL,
    placar_casa INT DEFAULT 0 NOT NULL,
    placar_fora INT DEFAULT 0 NOT NULL,
    tempo_restante INT DEFAULT 600 NOT NULL,
    is_active BOOLEAN DEFAULT false NOT NULL,
    is_paused BOOLEAN DEFAULT true NOT NULL,
    gols JSONB DEFAULT '[]'::jsonb NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 11. TABELA: gols (Registro individual de cada gol)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    partida_id UUID REFERENCES public.partidas(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    jogador_nome TEXT NOT NULL,
    time_id TEXT NOT NULL,
    minuto INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ==============================================================================
-- 12. TABELA: capas (Histórico oficial de Capas conquistadas por rodada)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.capas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    time_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_capa_rodada_jogador UNIQUE (rodada_id, jogador_id)
);

-- ==============================================================================
-- ÍNDICES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_futebois_codigo ON public.futebois(codigo_publico);
CREATE INDEX IF NOT EXISTS idx_jogadores_futebol ON public.jogadores(futebol_id);
CREATE INDEX IF NOT EXISTS idx_rodadas_futebol ON public.rodadas(futebol_id);
CREATE INDEX IF NOT EXISTS idx_partidas_futebol ON public.partidas(futebol_id);
CREATE INDEX IF NOT EXISTS idx_gols_futebol ON public.gols(futebol_id);
CREATE INDEX IF NOT EXISTS idx_times_futebol ON public.times(futebol_id);
CREATE INDEX IF NOT EXISTS idx_capas_futebol ON public.capas(futebol_id);
CREATE INDEX IF NOT EXISTS idx_capas_jogador ON public.capas(jogador_id);

-- ==============================================================================
-- CONFIGURAÇÃO DE ROW LEVEL SECURITY (RLS)
-- Regra de ouro:
-- 1. Qualquer usuário público pode consultar (SELECT) dados públicos do futebol.
-- 2. Apenas administradores autenticados vinculados ao futebol_id podem
--    efetuar INSERT, UPDATE ou DELETE.
-- 3. Usuários anônimos / públicos são BARRADOS de qualquer modificação.
-- ==============================================================================

ALTER TABLE public.futebois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.futebol_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jogadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rodadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rodada_jogadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_jogadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partida_ao_vivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capas ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- POLÍTICAS: futebois
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public pode ler futebois" ON public.futebois;
CREATE POLICY "Public pode ler futebois" ON public.futebois
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin autenticado cria futebol" ON public.futebois;
CREATE POLICY "Admin autenticado cria futebol" ON public.futebois
    FOR INSERT WITH CHECK (auth.uid() = admin_id);

DROP POLICY IF EXISTS "Admin altera seu futebol" ON public.futebois;
CREATE POLICY "Admin altera seu futebol" ON public.futebois
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = futebois.id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: futebol_admins
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins podem visualizar equipe adm" ON public.futebol_admins;
CREATE POLICY "Admins podem visualizar equipe adm" ON public.futebol_admins
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin cadastra a si mesmo no futebol" ON public.futebol_admins;
CREATE POLICY "Admin cadastra a si mesmo no futebol" ON public.futebol_admins
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- POLÍTICAS: jogadores
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le jogadores do futebol" ON public.jogadores;
CREATE POLICY "Publico le jogadores do futebol" ON public.jogadores
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin insere jogadores no seu futebol" ON public.jogadores;
CREATE POLICY "Admin insere jogadores no seu futebol" ON public.jogadores
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin atualiza jogadores no seu futebol" ON public.jogadores;
CREATE POLICY "Admin atualiza jogadores no seu futebol" ON public.jogadores
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin deleta jogadores no seu futebol" ON public.jogadores;
CREATE POLICY "Admin deleta jogadores no seu futebol" ON public.jogadores
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: rodadas
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le rodadas" ON public.rodadas;
CREATE POLICY "Publico le rodadas" ON public.rodadas
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia rodadas" ON public.rodadas;
CREATE POLICY "Admin gerencia rodadas" ON public.rodadas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = rodadas.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: rodada_jogadores
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le jogadores da rodada" ON public.rodada_jogadores;
CREATE POLICY "Publico le jogadores da rodada" ON public.rodada_jogadores
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia jogadores da rodada" ON public.rodada_jogadores;
CREATE POLICY "Admin gerencia jogadores da rodada" ON public.rodada_jogadores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = rodada_jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: times e time_jogadores
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le times" ON public.times;
CREATE POLICY "Publico le times" ON public.times FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia times" ON public.times;
CREATE POLICY "Admin gerencia times" ON public.times
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = times.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Publico le jogadores dos times" ON public.time_jogadores;
CREATE POLICY "Publico le jogadores dos times" ON public.time_jogadores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia jogadores dos times" ON public.time_jogadores;
CREATE POLICY "Admin gerencia jogadores dos times" ON public.time_jogadores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = time_jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: partidas, partida_ao_vivo e gols
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le partidas" ON public.partidas;
CREATE POLICY "Publico le partidas" ON public.partidas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia partidas" ON public.partidas;
CREATE POLICY "Admin gerencia partidas" ON public.partidas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = partidas.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Publico le partida ao vivo" ON public.partida_ao_vivo;
CREATE POLICY "Publico le partida ao vivo" ON public.partida_ao_vivo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia partida ao vivo" ON public.partida_ao_vivo;
CREATE POLICY "Admin gerencia partida ao vivo" ON public.partida_ao_vivo
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = partida_ao_vivo.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Publico le gols" ON public.gols;
CREATE POLICY "Publico le gols" ON public.gols FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia gols" ON public.gols;
CREATE POLICY "Admin gerencia gols" ON public.gols
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = gols.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- POLÍTICAS: capas
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Publico le capas" ON public.capas;
CREATE POLICY "Publico le capas" ON public.capas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia capas" ON public.capas;
CREATE POLICY "Admin gerencia capas" ON public.capas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = capas.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- Habilita Realtime para sincronização automática entre múltiplos dispositivos
ALTER PUBLICATION supabase_realtime ADD TABLE public.partida_ao_vivo;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partidas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gols;
ALTER PUBLICATION supabase_realtime ADD TABLE public.capas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rodadas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jogadores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.futebois;

-- ==============================================================================
-- SEGURANÇA: BLOQUEIO DEFINITIVO DE DADOS HISTÓRICOS APÓS FECHAMENTO DA CARGA
-- Impede alteração de gols_historicos_iniciais e capas_historicas_iniciais
-- se historico_inicial_aberto for false para o futebol correspondente.
-- Novos jogadores inseridos após fechamento recebem obrigatoriamente 0.
-- ==============================================================================
CREATE OR REPLACE FUNCTION check_jogador_historico_modificacao()
RETURNS TRIGGER AS $$
DECLARE
    v_aberto BOOLEAN;
BEGIN
    SELECT historico_inicial_aberto INTO v_aberto
    FROM public.futebois
    WHERE id = NEW.futebol_id;

    IF v_aberto IS FALSE THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.gols_historicos_iniciais IS DISTINCT FROM OLD.gols_historicos_iniciais OR
               NEW.capas_historicas_iniciais IS DISTINCT FROM OLD.capas_historicas_iniciais THEN
                RAISE EXCEPTION 'A carga histórica inicial deste futebol já foi finalizada e os dados históricos estão bloqueados.';
            END IF;
        ELSIF TG_OP = 'INSERT' THEN
            NEW.gols_historicos_iniciais := 0;
            NEW.capas_historicas_iniciais := 0;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_jogador_historico ON public.jogadores;
CREATE TRIGGER trg_check_jogador_historico
BEFORE INSERT OR UPDATE ON public.jogadores
FOR EACH ROW EXECUTE FUNCTION check_jogador_historico_modificacao();

