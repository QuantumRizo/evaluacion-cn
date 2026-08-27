// Deploy with: supabase functions deploy send-assignment-email
/* global Deno */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ success: false, message: 'Unauthorized' }, 401);
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    const { data: admin } = await adminClient.from('employees').select('role').eq('auth_user_id', user.id).single();
    if (admin?.role !== 'admin') return json({ success: false, message: 'Admin access required' }, 403);

    const payload = await request.json();
    const { cycle_id, evaluated_id, evaluator_ids } = payload;
    if (!cycle_id || !evaluated_id || !Array.isArray(evaluator_ids)) return json({ success: false, message: 'Missing IDs' }, 400);
    const [{ data: evaluated }, { data: cycle }, { data: questions }, { data: responses }, { data: comments }] = await Promise.all([
      adminClient.from('employees').select('*').eq('id', evaluated_id).single(),
      adminClient.from('evaluation_cycles').select('*').eq('id', cycle_id).single(),
      adminClient.from('questions').select('*'),
      adminClient.from('responses').select('*').eq('cycle_id', cycle_id).eq('evaluated_id', evaluated_id),
      adminClient.from('evaluation_comments').select('*').eq('cycle_id', cycle_id).eq('evaluated_id', evaluated_id),
    ]);
    if (!evaluated || !cycle) return json({ success: false, message: 'Evaluated or cycle not found' }, 404);
    const uniqueIds = [...new Set(evaluator_ids)];
    const pending = uniqueIds.filter((id) => {
      const answered = new Set((responses ?? []).filter((row) => row.evaluator_id === id).map((row) => row.question_id));
      const hasComments = (comments ?? []).some((row) => row.evaluator_id === id && row.strengths?.trim() && row.opportunities?.trim());
      return answered.size < (questions ?? []).length || !hasComments;
    });
    const { data: evaluators } = await adminClient.from('employees').select('*').in('id', pending);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ success: false, message: 'Email service not configured' }, 500);
    const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
    const appUrl = Deno.env.get('APP_URL') ?? 'https://evaluacion-cn.vercel.app';
    const deadline = cycle.end_date ? new Date(cycle.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'pronto';
    let successCount = 0;
    for (const evaluator of evaluators ?? []) {
      const self = evaluator.id === evaluated_id;
      const subject = self ? `Autoevaluación Requerida: ${cycle.name}` : `Requerimiento de Evaluación: ${evaluated.name}`;
      const body = `<div style="font-family:Arial,sans-serif;color:#333"><h2 style="color:#416364">Requerimiento de Evaluación de Desempeño</h2><p>Hola <strong>${escapeHtml(evaluator.name).split(' ')[0]}</strong>,</p><p>Debes completar ${self ? 'tu autoevaluación' : `la evaluación de ${escapeHtml(evaluated.name)}`} para el ciclo <strong>${escapeHtml(cycle.name)}</strong> antes del <strong>${escapeHtml(deadline)}</strong>.</p><p><a href="${appUrl}" style="background:#416364;color:white;padding:12px 24px;border-radius:8px;text-decoration:none">Ingresar al Portal</a></p></div>`;
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: evaluator.email, subject, html: body }) });
      if (response.ok) successCount++;
    }
    return json({ success: true, successCount, skippedCount: uniqueIds.length - pending.length });
  } catch (error) { console.error(error); return json({ success: false, message: 'Internal error' }, 500); }
});
