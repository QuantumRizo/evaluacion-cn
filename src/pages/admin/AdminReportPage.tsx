

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, fetchAllDocuments, Query } from '../../lib/appwrite';
import { ID } from 'appwrite';
import { DB_ID, COLLECTIONS, CATEGORY_ORDER, CATEGORY_LABELS } from '../../lib/constants';
import Navbar from '../../components/Navbar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Employee, EvaluationCycle, Question, Response, FinalReport, CategoryScore } from '../../types';

export default function AdminReportPage() {
  const { cycleId, employeeId } = useParams<{ cycleId: string; employeeId: string }>();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [cycle, setCycle] = useState<EvaluationCycle | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [comments, setComments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [adminSummary, setAdminSummary] = useState('');
  const [finalScore, setFinalScore] = useState<number | ''>('');

  // Computed scores
  const selfResponses = responses.filter((r) => r.evaluation_type === 'self');
  const peerResponses = responses.filter((r) => r.evaluation_type === 'peer');
  const uniquePeerCount = new Set(peerResponses.map((r) => r.evaluator_id)).size;
  const totalQ = questions.length;

  const selfScore =
    selfResponses.length > 0 && totalQ > 0
      ? selfResponses.reduce((s, r) => s + r.score, 0) / totalQ
      : null;

  const collectiveScore =
    peerResponses.length > 0 && uniquePeerCount > 0 && totalQ > 0
      ? peerResponses.reduce((s, r) => s + r.score, 0) / (totalQ * uniquePeerCount)
      : null;

  // Category breakdown
  const categoryScores: CategoryScore[] = CATEGORY_ORDER.map((cat) => {
    const catQ = questions.filter((q) => q.category === cat);
    const catQIds = new Set(catQ.map((q) => q.$id));

    const selfCatR = selfResponses.filter((r) => catQIds.has(r.question_id));
    const peerCatR = peerResponses.filter((r) => catQIds.has(r.question_id));

    const selfCatScore =
      selfCatR.length > 0 && catQ.length > 0
        ? selfCatR.reduce((s, r) => s + r.score, 0) / catQ.length
        : null;

    const peerCatScore =
      peerCatR.length > 0 && uniquePeerCount > 0 && catQ.length > 0
        ? peerCatR.reduce((s, r) => s + r.score, 0) / (catQ.length * uniquePeerCount)
        : null;

    return {
      category: cat,
      selfScore: selfCatScore,
      collectiveScore: peerCatScore,
      questionCount: catQ.length,
    };
  }).filter((c) => c.questionCount > 0);

  useEffect(() => {
    if (employeeId && cycleId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, cycleId]);

  async function loadData() {
    try {
      const [empDoc, cycleDoc, allQuestions] = await Promise.all([
        databases.getDocument(DB_ID, COLLECTIONS.EMPLOYEES, employeeId!),
        databases.getDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, cycleId!),
        fetchAllDocuments<Question>(COLLECTIONS.QUESTIONS, [Query.orderAsc('order')]),
      ]);

      setEmployee(empDoc as unknown as Employee);
      setCycle(cycleDoc as unknown as EvaluationCycle);
      setQuestions(allQuestions);

      const [allResponses, reportResult, allComments, allEmps] = await Promise.all([
        fetchAllDocuments<Response>(COLLECTIONS.RESPONSES, [
          Query.equal('evaluated_id', employeeId!),
          Query.equal('cycle_id', cycleId!),
        ]),
        databases.listDocuments(DB_ID, COLLECTIONS.FINAL_REPORTS, [
          Query.equal('employee_id', employeeId!),
          Query.equal('cycle_id', cycleId!),
          Query.limit(1),
        ]),
        fetchAllDocuments<any>(COLLECTIONS.EVALUATION_COMMENTS, [
          Query.equal('evaluated_id', employeeId!),
          Query.equal('cycle_id', cycleId!),
        ]),
        fetchAllDocuments<Employee>(COLLECTIONS.EMPLOYEES),
      ]);

      setResponses(allResponses);
      setComments(allComments);
      setEmployees(allEmps);

      if (reportResult.documents.length > 0) {
        const r = reportResult.documents[0] as unknown as FinalReport;
        setReport(r);
        setAdminSummary(r.admin_summary ?? '');
        setFinalScore(r.final_score ?? '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveReport() {
    if (!cycle || !employeeId) return;
    setSaving(true);
    setSaved(false);
    try {
      const data = {
        cycle_id: cycle.$id,
        employee_id: employeeId,
        self_score: selfScore ?? undefined,
        collective_score: collectiveScore ?? undefined,
        admin_summary: adminSummary,
        final_score: finalScore !== '' ? Number(finalScore) : undefined,
        is_exported: false,
      };

      if (report) {
        await databases.updateDocument(DB_ID, COLLECTIONS.FINAL_REPORTS, report.$id, data);
      } else {
        const newDoc = await databases.createDocument(
          DB_ID, COLLECTIONS.FINAL_REPORTS, ID.unique(), data
        );
        setReport(newDoc as unknown as FinalReport);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  function exportToCSV() {
    if (!employee || !cycle || questions.length === 0) return;

    const questionHeaders = questions.map(q => `"${q.text.replace(/"/g, '""')}"`);
    const categoryHeaders = CATEGORY_ORDER.map(cat => `"${CATEGORY_LABELS[cat]}"`);
    const headers = [
      'Evaluado', 
      'Área del Evaluado', 
      'Evaluador', 
      'Área del Evaluador', 
      'Tipo de Evaluación',
      ...questionHeaders,
      'Top 1 Fortaleza',
      'Top 2 Fortaleza',
      'Top 3 Fortaleza',
      'Top 1 Oportunidad',
      'Top 2 Oportunidad',
      'Top 3 Oportunidad',
      ...categoryHeaders,
      'Comentario General',
      'Fortalezas',
      'Oportunidades',
      'Síntesis Administrativa',
      'Calificación Final'
    ];

    const rows: string[] = [];
    const evIds = Array.from(new Set([...responses.map(r => r.evaluator_id), ...comments.map(c => c.evaluator_id)]));

    evIds.forEach(evId => {
      const evaluator = employees.find(e => e.$id === evId);
      if (!evaluator) return;

      const isSelf = evId === employeeId;
      const row = [
        `"${employee.name}"`,
        `"${employee.department || ''}"`,
        `"${evaluator.name}"`,
        `"${evaluator.department || ''}"`,
        `"${isSelf ? 'Autoevaluacion' : 'Colectiva'}"`
      ];

      const evResponses = responses.filter(r => r.evaluator_id === evId);
      questions.forEach(q => {
        const resp = evResponses.find(r => r.question_id === q.$id);
        row.push(resp ? `"${Math.round(resp.score * 100)}%"` : '"N/A"');
      });

      // Top 3 Fortalezas
      const sortedDesc = [...evResponses].sort((a, b) => b.score - a.score);
      for(let i=0; i<3; i++) {
        const r = sortedDesc[i];
        if(r) {
          const q = questions.find(q => q.$id === r.question_id);
          row.push(`"${q?.text.replace(/"/g, '""') || ''} (${Math.round(r.score * 100)}%)"`);
        } else {
          row.push('""');
        }
      }

      // Top 3 Oportunidades
      const sortedAsc = [...evResponses].sort((a, b) => a.score - b.score);
      for(let i=0; i<3; i++) {
        const r = sortedAsc[i];
        if(r) {
          const q = questions.find(q => q.$id === r.question_id);
          row.push(`"${q?.text.replace(/"/g, '""') || ''} (${Math.round(r.score * 100)}%)"`);
        } else {
          row.push('""');
        }
      }

      // Categorías
      CATEGORY_ORDER.forEach(cat => {
        const catQuestions = questions.filter(q => q.category === cat);
        const catResponses = evResponses.filter(r => catQuestions.some(q => q.$id === r.question_id));
        if (catResponses.length > 0) {
          const catScore = catResponses.reduce((acc, r) => acc + r.score, 0) / catResponses.length;
          row.push(`"${Math.round(catScore * 100)}%"`);
        } else {
          row.push('"N/A"');
        }
      });

      const evComment = comments.find(c => c.evaluator_id === evId);
      row.push(evComment && evComment.comment ? `"${evComment.comment.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
      row.push(evComment && evComment.strengths ? `"${evComment.strengths.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
      row.push(evComment && evComment.opportunities ? `"${evComment.opportunities.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
      
      row.push(`"${adminSummary.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
      row.push(`"${finalScore !== '' ? Math.round(Number(finalScore) * 100) + '%' : 'Pendiente'}"`);

      rows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `reporte_${employee.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) return <div className="min-h-screen bg-surface-100 md:pl-64 print:pl-0"><Navbar /><LoadingSpinner fullPage /></div>;

  return (
    <div className="min-h-screen bg-surface-100 md:pl-64 print:pl-0">
      {/* Navbar — hidden on print */}
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Screen header */}
        <div className="print:hidden flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-700 transition-colors mb-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </button>
            <h1 className="text-2xl font-bold text-surface-800">
              Reporte: {employee?.name}
            </h1>
            <p className="text-surface-400 text-sm mt-1">
              {cycle ? `Ciclo: ${cycle.name}` : 'Sin ciclo activo'}
            </p>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-surface-200 bg-white hover:border-surface-300 text-surface-700 text-sm font-medium transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Excel
          </button>
        </div>

        {/* ═══ PRINTABLE REPORT CONTENT ═══ */}
        <div id="report-content">
          {/* Print-only header */}
          <div className="hidden print:block mb-8 pb-6 border-b border-surface-200">
            <h1 className="text-2xl font-bold text-surface-900">
              Central de Negocios
            </h1>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-surface-500">Colaborador: </span>
                <span className="font-semibold text-surface-800">{employee?.name}</span>
              </div>
              <div>
                <span className="text-surface-500">Área: </span>
                <span className="font-semibold text-surface-800">{employee?.department ?? '—'}</span>
              </div>
              <div>
                <span className="text-surface-500">Ciclo: </span>
                <span className="font-semibold text-surface-800">{cycle?.name ?? '—'}</span>
              </div>
              <div>
                <span className="text-surface-500">Fecha: </span>
                <span className="font-semibold text-surface-800">{today}</span>
              </div>
            </div>
          </div>

          {/* Score summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <ScoreCard
              label="Autoevaluación"
              score={selfScore}
              color="blue"
              description="Calificación personal"
            />
            <ScoreCard
              label="Calificación Colectiva"
              score={collectiveScore}
              color="green"
              description={`Promedio de ${uniquePeerCount} evaluador${uniquePeerCount !== 1 ? 'es' : ''}`}
            />
            <ScoreCard
              label="Calificación Final"
              score={finalScore !== '' ? Number(finalScore) : null}
              color="purple"
              description="Definida por el administrador"
            />
          </div>

          {/* Category breakdown */}
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-800">
                Resultados por Categoría
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Categoría</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Preguntas</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Autoevaluación</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Colectiva</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {categoryScores.map((cs) => {
                  const diff =
                    cs.selfScore !== null && cs.collectiveScore !== null
                      ? cs.collectiveScore - cs.selfScore
                      : null;
                  return (
                    <tr key={cs.category} className="hover:bg-surface-50/30">
                      <td className="px-6 py-3.5 font-medium text-surface-700">
                        {CATEGORY_LABELS[cs.category]}
                      </td>
                      <td className="px-6 py-3.5 text-center text-surface-500">
                        {cs.questionCount}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {cs.selfScore !== null
                          ? <span className="font-semibold text-primary-600">{pct(cs.selfScore)}</span>
                          : <span className="text-surface-300">—</span>}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {cs.collectiveScore !== null
                          ? <span className="font-semibold text-green-600">{pct(cs.collectiveScore)}</span>
                          : <span className="text-surface-300">—</span>}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {diff !== null ? (
                          <span className={`text-xs font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-surface-400'}`}>
                            {diff > 0 ? '+' : ''}{pct(diff)}
                          </span>
                        ) : <span className="text-surface-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Admin summary */}
          <div className="bg-white rounded-2xl border border-surface-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-surface-800 mb-4">
              Síntesis Administrativa
            </h2>

            {/* Screen: editable */}
            <div className="print:hidden">
              <textarea
                value={adminSummary}
                onChange={(e) => setAdminSummary(e.target.value)}
                placeholder="Redacta aquí el análisis consolidado del colaborador. Este texto, junto con la calificación final, será el contenido del reporte exportado."
                rows={6}
                className="w-full px-4 py-3 rounded-xl border border-surface-200 bg-surface-50 text-sm text-surface-700 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 resize-none leading-relaxed"
              />

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-surface-600">
                    Calificación final (0.00 – 1.00):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={finalScore}
                    onChange={(e) => setFinalScore(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-24 px-3 py-1.5 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-800 text-center focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex items-center gap-3">
                  {saved && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Guardado
                    </span>
                  )}
                  <button
                    onClick={saveReport}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white text-sm font-medium transition-colors"
                  >
                    {saving ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
                    ) : 'Guardar reporte'}
                  </button>
                </div>
              </div>
            </div>

            {/* Print: static text */}
            <div className="hidden print:block">
              <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                {adminSummary || 'Sin síntesis administrativa.'}
              </p>
              {finalScore !== '' && (
                <div className="mt-6 pt-6 border-t border-surface-200">
                  <p className="text-xs text-surface-500 mb-1">Calificación Final</p>
                  <p className="text-3xl font-bold text-surface-900">{pct(Number(finalScore))}</p>
                </div>
              )}
            </div>
          </div>

          {/* Full Responses and Comments Section */}
          <div className="mt-12 pt-8 border-t border-surface-200">
            <h2 className="text-xl font-bold text-surface-800 mb-6">Detalle de Respuestas y Comentarios</h2>
            {employees.length > 0 && Array.from(new Set(responses.map(r => r.evaluator_id))).map(evaluatorId => {
              const evaluator = employees.find(e => e.$id === evaluatorId);
              if (!evaluator) return null;
              
              const isSelf = evaluator.$id === employeeId;
              const evResponses = responses.filter(r => r.evaluator_id === evaluatorId);
              const evComment = comments.find(c => c.evaluator_id === evaluatorId);

              return (
                <div key={evaluatorId} className="bg-white rounded-2xl border border-surface-200 p-6 mb-6" style={{ pageBreakInside: 'avoid' }}>
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-surface-100">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary-700">{evaluator.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-surface-800">
                        {evaluator.name}
                        {isSelf && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary-100 text-primary-700">Autoevaluación</span>}
                      </h3>
                      <p className="text-xs text-surface-500">{evaluator.position ?? 'Sin puesto'} • {evaluator.department ?? 'Sin área'}</p>
                    </div>
                  </div>

                  {evComment && (evComment.comment || evComment.strengths || evComment.opportunities) && (
                    <div className="mb-6 bg-surface-50 border border-surface-100 rounded-xl p-4 flex flex-col gap-4">
                      {evComment.comment && (
                        <div>
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Comentario General</p>
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.comment}</p>
                        </div>
                      )}
                      {evComment.strengths && (
                        <div>
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Fortalezas</p>
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.strengths}</p>
                        </div>
                      )}
                      {evComment.opportunities && (
                        <div>
                          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Oportunidades de Mejora</p>
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.opportunities}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Respuestas (0% a 100%)</p>
                    <div className="space-y-3">
                      {questions.map((q, idx) => {
                        const resp = evResponses.find(r => r.question_id === q.$id);
                        if (!resp) return null;
                        const scorePct = Math.round(resp.score * 100);
                        const color = scorePct >= 75 ? 'text-green-700 bg-green-50 border-green-200' :
                                      scorePct >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200' :
                                      'text-red-700 bg-red-50 border-red-200';
                        return (
                          <div key={q.$id} className="flex gap-4 items-start py-2 border-b border-surface-50 last:border-0">
                            <span className="text-surface-300 font-medium text-sm w-4 shrink-0">{idx + 1}.</span>
                            <p className="text-sm text-surface-700 flex-1 leading-relaxed">{q.text}</p>
                            <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold border shrink-0 ${color}`}>
                              {scorePct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Print-only signature section */}
          <div className="hidden print:block mt-12 pt-8 border-t border-surface-200">
            <div className="grid grid-cols-2 gap-12">
              <div>
                <div className="border-t border-surface-800 pt-2 mt-10">
                  <p className="text-xs text-surface-500">Firma del Administrador</p>
                </div>
              </div>
              <div>
                <div className="border-t border-surface-800 pt-2 mt-10">
                  <p className="text-xs text-surface-500">Firma del Colaborador</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-surface-400 text-center mt-8">
              Documento generado el {today} — Central de Negocios
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function pct(val: number): string {
  return `${Math.round(val * 100)}%`;
}

function ScoreCard({
  label,
  score,
  color,
  description,
}: {
  label: string;
  score: number | null;
  color: 'blue' | 'green' | 'purple';
  description: string;
}) {
  const colorMap = {
    blue: { bg: 'bg-primary-50', border: 'border-primary-100', text: 'text-primary-600', sub: 'text-primary-400' },
    green: { bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-600', sub: 'text-green-400' },
    purple: { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-600', sub: 'text-violet-400' },
  };
  const c = colorMap[color];

  return (
    <div className={`rounded-2xl border p-5 ${c.bg} ${c.border}`}>
      <p className="text-xs font-medium text-surface-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${c.text} mb-1`}>
        {score !== null ? pct(score) : '—'}
      </p>
      <p className={`text-xs ${c.sub}`}>{description}</p>
    </div>
  );
}
