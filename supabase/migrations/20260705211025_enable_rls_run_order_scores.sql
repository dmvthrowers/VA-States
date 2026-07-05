-- Applied to prod 2026-07-05 via Supabase MCP. RLS for run order + scores.
ALTER TABLE public.vsyc_run_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsyc_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_run_order" ON public.vsyc_run_order FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_scores" ON public.vsyc_scores FOR ALL USING (auth.role() = 'service_role');
