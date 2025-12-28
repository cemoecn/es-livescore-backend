-- Enable Row Level Security (RLS) for all public tables
-- This ensures data is protected even with the anon key

-- ============================================
-- COMPETITIONS TABLE
-- ============================================
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read competitions
CREATE POLICY "Allow public read competitions" 
ON public.competitions FOR SELECT 
USING (true);

-- Only service role can write
CREATE POLICY "Allow service write competitions" 
ON public.competitions FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================
-- COUNTRIES TABLE
-- ============================================
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read countries" 
ON public.countries FOR SELECT 
USING (true);

CREATE POLICY "Allow service write countries" 
ON public.countries FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================
-- TEAMS TABLE
-- ============================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read teams" 
ON public.teams FOR SELECT 
USING (true);

CREATE POLICY "Allow service write teams" 
ON public.teams FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================
-- MATCHES TABLE
-- ============================================
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read matches" 
ON public.matches FOR SELECT 
USING (true);

CREATE POLICY "Allow service write matches" 
ON public.matches FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================
-- MATCH_EVENTS TABLE
-- ============================================
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read match_events" 
ON public.match_events FOR SELECT 
USING (true);

CREATE POLICY "Allow service write match_events" 
ON public.match_events FOR ALL 
USING (auth.role() = 'service_role');

-- ============================================
-- STANDINGS TABLE
-- ============================================
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read standings" 
ON public.standings FOR SELECT 
USING (true);

CREATE POLICY "Allow service write standings" 
ON public.standings FOR ALL 
USING (auth.role() = 'service_role');
