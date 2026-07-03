import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, fetchAllDocuments, Query, functions } from '../../lib/appwrite';
import { ID } from 'appwrite';
import { DB_ID, COLLECTIONS, CATEGORY_ORDER, CATEGORY_LABELS } from '../../lib/constants';
import Navbar from '../../components/Navbar';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Employee, EvaluationCycle, Response, EvaluationAssignment } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmployeeStats extends Employee {
  evaluatorCount: number;
  assignedCount: number;
  selfScore: number | null;
  collectiveScore: number | null;
}

type Tab = 'ciclos' | 'resultados';

// ─── Helpers ─────────────────────────────────────────────────────────────────


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active:  { label: 'Activo',   className: 'bg-green-50 text-green-700 border-green-200' },
    draft:   { label: 'Borrador', className: 'bg-surface-100 text-surface-500 border-surface-200' },
    closed:  { label: 'Cerrado',  className: 'bg-red-50 text-red-600 border-red-100' },
  };
  const cfg = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.className}`}>
      {status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      {cfg.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('ciclos');

  // Shared state
  const [allCycles, setAllCycles] = useState<EvaluationCycle[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);


  // Results Tab state
  const [selectedResultCycleId, setSelectedResultCycleId] = useState<string>('');
  const [resultsStats, setResultsStats] = useState<EmployeeStats[]>([]);
  const [cycleData, setCycleData] = useState<{
    responses: Response[];
    assignments: EvaluationAssignment[];
    comments: any[];
  } | null>(null);
  const [allQuestions, setAllQuestions] = useState<any[]>([]);

  // Removed progress tab state
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cyclesResult, emps, qs] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.EVALUATION_CYCLES, [Query.orderDesc('$createdAt')]),
        fetchAllDocuments<Employee>(COLLECTIONS.EMPLOYEES, [Query.orderAsc('name')]),
        fetchAllDocuments<any>(COLLECTIONS.QUESTIONS),
      ]);
      const cycles = cyclesResult.documents as unknown as EvaluationCycle[];
      setAllCycles(cycles);
      setAllEmployees(emps);
      setAllQuestions(qs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Set initial cycle selection once cycles are loaded
  useEffect(() => {
    if (!selectedResultCycleId && allCycles.length > 0) {
      setSelectedResultCycleId(allCycles[0].$id);
    }
  }, [allCycles, selectedResultCycleId]);

  // Use a ref for allEmployees to avoid re-triggering loadResults
  const allEmployeesRef = useRef(allEmployees);
  allEmployeesRef.current = allEmployees;

  // Load stats specifically for the selected cycle in Results
  useEffect(() => {
    async function loadResults() {
      if (!selectedResultCycleId || allEmployeesRef.current.length === 0) return;
      
      setCycleData(null);
      setResultsStats([]);

      try {
        const [allResponses, cycleAssignments, allComments] = await Promise.all([
          fetchAllDocuments<Response>(COLLECTIONS.RESPONSES, [Query.equal('cycle_id', selectedResultCycleId)]),
          fetchAllDocuments<EvaluationAssignment>(COLLECTIONS.EVALUATION_ASSIGNMENTS, [Query.equal('cycle_id', selectedResultCycleId)]),
          fetchAllDocuments<any>(COLLECTIONS.EVALUATION_COMMENTS, [Query.equal('cycle_id', selectedResultCycleId)]),
        ]);

        const totalQuestions = allQuestions.length;
        
        // We only care about employees who have at least one assignment (as evaluated) in this cycle
        const participants = allEmployeesRef.current.filter(emp => cycleAssignments.some(a => a.evaluated_id === emp.$id));

        const stats: EmployeeStats[] = participants.map((emp) => {
          const myResponses = allResponses.filter((r) => r.evaluated_id === emp.$id);
          const selfResponses = myResponses.filter((r) => r.evaluation_type === 'self');
          const peerResponses = myResponses.filter((r) => r.evaluation_type === 'peer');
          const uniquePeerEvaluators = new Set(peerResponses.map((r) => r.evaluator_id)).size;
          const assignedCount = cycleAssignments.filter((a) => a.evaluated_id === emp.$id).length;

          const selfScore = selfResponses.length > 0 && totalQuestions > 0
            ? selfResponses.reduce((s, r) => s + r.score, 0) / totalQuestions : null;
          const collectiveScore = peerResponses.length > 0 && uniquePeerEvaluators > 0 && totalQuestions > 0
            ? peerResponses.reduce((s, r) => s + r.score, 0) / (totalQuestions * uniquePeerEvaluators) : null;

          return { ...emp, evaluatorCount: uniquePeerEvaluators, assignedCount, selfScore, collectiveScore };
        });
        setResultsStats(stats);
        setCycleData({
          responses: allResponses,
          assignments: cycleAssignments,
          comments: allComments
        });
      } catch (err) {
        console.error(err);
      }
    }
    loadResults();
  }, [selectedResultCycleId]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'ciclos', label: 'Gestión de Ciclos',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
    },
    {
      id: 'resultados', label: 'Progreso y Resultados',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    },
  ];

  return (
    <div className="min-h-screen bg-surface-100 md:pl-64">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-surface-800">Panel Administrativo</h1>
          <p className="text-surface-400 text-sm mt-1">Configura múltiples ciclos simultáneos y revisa sus resultados.</p>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-white border border-surface-200 rounded-2xl p-1.5 mb-6 w-fit shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-surface-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading && allCycles.length === 0 ? <LoadingSpinner /> : (
          <>

            {activeTab === 'ciclos' && (
              <CyclesTab cycles={allCycles} allEmployees={allEmployees} onRefresh={loadData} />
            )}
            {/* ProgressTab removed as per user request */}
            {activeTab === 'resultados' && (
              <ResultsTab 
                cycles={allCycles}
                selectedCycleId={selectedResultCycleId}
                onSelectCycle={setSelectedResultCycleId}
                employees={resultsStats}
                allEmployees={allEmployees}
                onViewReport={(cycleId, empId) => navigate(`/admin/report/${cycleId}/${empId}`)}
                cycleData={cycleData}
                allQuestions={allQuestions}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── TAB 1: Ciclos y Asignaciones ─────────────────────────────────────────────

function CyclesTab({ 
  cycles, 
  allEmployees, 
  onRefresh 
}: { 
  cycles: EvaluationCycle[]; 
  allEmployees: Employee[];
  onRefresh: () => void;
}) {
  const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle | null>(null);
  
  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);

  async function createCycle() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const newId = ID.unique();
      await databases.createDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, newId, {
        name: name.trim(),
        status: 'active',
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setName(''); setStartDate(''); setEndDate(''); setShowCreate(false);
      onRefresh();
    } catch (err) { console.error(err); }
    finally { setCreating(false); }
  }

  function startEdit(c: EvaluationCycle) {
    setEditing(true);
    setEditName(c.name);
    setEditStart(c.start_date ? c.start_date.slice(0, 10) : '');
    setEditEnd(c.end_date ? c.end_date.slice(0, 10) : '');
  }

  async function saveEdit() {
    if (!selectedCycle) return;
    setSaving(true);
    try {
      await databases.updateDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, selectedCycle.$id, {
        name: editName.trim(),
        start_date: editStart || undefined,
        end_date: editEnd || undefined,
      });
      setEditing(false);
      onRefresh();
      setSelectedCycle({ ...selectedCycle, name: editName.trim(), start_date: editStart, end_date: editEnd });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function setStatus(cycleId: string, status: 'active' | 'closed') {
    try {
      // We no longer close other cycles! Multiple can be active.
      await databases.updateDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, cycleId, { status });
      onRefresh();
      if (selectedCycle?.$id === cycleId) {
        setSelectedCycle({ ...selectedCycle, status });
      }
    } catch (err) { console.error(err); }
  }

  async function deleteCycle(cycleId: string) {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este ciclo? Todas las asignaciones se perderán.')) return;
    try {
      await databases.deleteDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, cycleId);
      // Delete related assignments
      const assignmentsResponse = await databases.listDocuments(DB_ID, COLLECTIONS.EVALUATION_ASSIGNMENTS, [Query.equal('cycle_id', cycleId)]);
      for (const a of assignmentsResponse.documents) {
        await databases.deleteDocument(DB_ID, COLLECTIONS.EVALUATION_ASSIGNMENTS, a.$id);
      }
      if (selectedCycle?.$id === cycleId) {
        setSelectedCycle(null);
      }
      onRefresh();
    } catch (err) { console.error(err); }
  }

  return (
    <div className="grid md:grid-cols-12 gap-6 h-[700px]">
      {/* Left: Cycles List */}
      <div className="md:col-span-4 bg-white rounded-2xl border border-surface-200 overflow-hidden flex flex-col h-full">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50">
          <h2 className="font-semibold text-surface-800">Ciclos de Evaluación</h2>
          <button 
            onClick={() => { setShowCreate(!showCreate); setSelectedCycle(null); }}
            className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center hover:bg-primary-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-grow divide-y divide-surface-50 p-2">
          {showCreate && (
            <div className="bg-primary-50/50 p-4 rounded-xl border border-primary-100 mb-3">
              <h3 className="text-xs font-semibold text-primary-800 mb-3">Crear Nuevo Ciclo</h3>
              <input type="text" placeholder="Nombre (Ej: IT 2026)" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-primary-200 text-sm mb-2" />
              <div className="flex gap-2 mb-3">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-primary-200 text-xs" title="Inicio" />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-primary-200 text-xs" title="Fin" />
              </div>
              <div className="flex gap-2">
                <button onClick={createCycle} disabled={!name.trim() || creating} className="flex-1 py-1.5 bg-primary-500 text-white rounded-lg text-xs font-medium">Crear</button>
                <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 border border-primary-200 text-primary-700 rounded-lg text-xs font-medium">Cancelar</button>
              </div>
            </div>
          )}

          {cycles.length === 0 && !showCreate && (
            <p className="text-center text-surface-400 text-sm py-10">No hay ciclos aún.</p>
          )}

          {cycles.map(c => (
            <button
              key={c.$id}
              onClick={() => { setSelectedCycle(c); setShowCreate(false); setEditing(false); }}
              className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${selectedCycle?.$id === c.$id ? 'bg-primary-50 border border-primary-300 shadow-md' : 'hover:bg-white hover:shadow-md hover:-translate-y-0.5 hover:border-primary-200 border border-transparent'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <p className={`font-medium text-sm ${selectedCycle?.$id === c.$id ? 'text-primary-800' : 'text-surface-800'}`}>{c.name}</p>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-[11px] text-surface-400">
                {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'Sin inicio'} - {c.end_date ? new Date(c.end_date).toLocaleDateString() : 'Sin fin'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Cycle Details & Assignments */}
      <div className="md:col-span-8 h-full">
        {!selectedCycle ? (
          <div className="bg-white rounded-2xl border border-surface-200 h-full flex flex-col items-center justify-center p-10 text-center">
            <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
            </div>
            <p className="text-surface-600 font-semibold">Selecciona un ciclo</p>
            <p className="text-surface-400 text-sm mt-1">Elige un ciclo de la lista para gestionar a sus participantes y configuraciones.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 h-full flex flex-col overflow-hidden">
            {/* Cycle Header */}
            <div className="px-6 py-5 border-b border-surface-100 bg-surface-50 shrink-0">
              {editing ? (
                <div className="flex gap-3 items-end">
                  <div className="flex-1"><label className="text-xs text-surface-500 mb-1 block">Nombre</label><input value={editName} onChange={e=>setEditName(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                  <div><label className="text-xs text-surface-500 mb-1 block">Inicio</label><input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                  <div><label className="text-xs text-surface-500 mb-1 block">Fin</label><input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                  <button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-medium">Guardar</button>
                  <button onClick={()=>setEditing(false)} className="px-4 py-2 border border-surface-200 rounded-xl text-sm">Cancelar</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-surface-800">{selectedCycle.name}</h2>
                      <StatusBadge status={selectedCycle.status} />
                    </div>
                    <p className="text-xs text-surface-500 mt-1">
                      Inicio: {selectedCycle.start_date ? new Date(selectedCycle.start_date).toLocaleDateString() : 'N/D'} | 
                      Límite: {selectedCycle.end_date ? new Date(selectedCycle.end_date).toLocaleDateString() : 'N/D'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(selectedCycle)} className="px-3 py-1.5 border border-surface-200 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100">Editar fechas</button>
                    {selectedCycle.status === 'draft' && <button onClick={() => setStatus(selectedCycle.$id, 'active')} className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100">Activar ciclo</button>}
                    {selectedCycle.status === 'active' && <button onClick={() => setStatus(selectedCycle.$id, 'closed')} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100">Cerrar ciclo</button>}
                    {selectedCycle.status === 'closed' && <button onClick={() => setStatus(selectedCycle.$id, 'active')} className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-lg text-xs font-medium hover:bg-surface-200">Reabrir</button>}
                    <button onClick={() => deleteCycle(selectedCycle.$id)} className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100">Eliminar</button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Assignments View inside Cycle */}
            <div className="flex-1 overflow-hidden">
              <CycleAssignments cycle={selectedCycle} allEmployees={allEmployees} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: Cycle Assignments (Right Side of Tab 1) ──────────────────

function CycleAssignments({ cycle, allEmployees }: { cycle: EvaluationCycle; allEmployees: Employee[] }) {
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEvaluated, setSelectedEvaluated] = useState<Employee | null>(null);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await fetchAllDocuments<EvaluationAssignment>(COLLECTIONS.EVALUATION_ASSIGNMENTS, [
        Query.equal('cycle_id', cycle.$id)
      ]);
      setAssignments(docs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [cycle.$id]);

  useEffect(() => { loadAssignments(); setSelectedEvaluated(null); }, [loadAssignments]);

  function selectEmployee(emp: Employee) {
    setSelectedEvaluated(emp);
    setSaved(false);
    const current = assignments.filter((a) => a.evaluated_id === emp.$id).map((a) => a.evaluator_id);
    setSelectedEvaluatorIds(new Set(current));
  }

  function toggleEvaluator(id: string) {
    const next = new Set(selectedEvaluatorIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedEvaluatorIds(next);
    setSaved(false);
  }

  async function saveAssignments(notify: boolean) {
    if (!selectedEvaluated) return;
    setSaving(true);
    try {
      console.log(`Guardando asignaciones para: ${selectedEvaluated.name} (notify=${notify})`);
      const existing = assignments.filter((a) => a.evaluated_id === selectedEvaluated.$id);
      for (const a of existing) await databases.deleteDocument(DB_ID, COLLECTIONS.EVALUATION_ASSIGNMENTS, a.$id);
      
      const evaluatorsToAssign = Array.from(selectedEvaluatorIds);
      if (!evaluatorsToAssign.includes(selectedEvaluated.$id)) {
        evaluatorsToAssign.push(selectedEvaluated.$id);
      }
      
      for (const evaluatorId of evaluatorsToAssign) {
        await databases.createDocument(DB_ID, COLLECTIONS.EVALUATION_ASSIGNMENTS, ID.unique(), {
          cycle_id: cycle.$id,
          evaluated_id: selectedEvaluated.$id,
          evaluator_id: evaluatorId,
        });
      }
      
      if (notify) {
        // Llamar a la función para correos en lote
        try {
          console.log('Enviando correos en lote vía Appwrite Functions...');
          const payload = JSON.stringify({
            cycle_id: cycle.$id,
            evaluated_id: selectedEvaluated.$id,
            evaluator_ids: evaluatorsToAssign
          });
          await functions.createExecution('send_assignment_email', payload, false, '/', 'POST' as any);
        } catch (funcErr) {
          console.error('Error invocando función de correos:', funcErr);
        }
      }

      setSaved(true);
      console.log(`✅ Se crearon ${evaluatorsToAssign.length} asignaciones${notify ? ' y se notificaron' : ' (sin notificación)'}`);
      await loadAssignments();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-10 flex justify-center"><LoadingSpinner /></div>;

  const candidates = allEmployees.filter((e) => e.$id !== selectedEvaluated?.$id);

  let hasChanges = false;
  let hasEvaluatorsSaved = false;

  if (selectedEvaluated) {
    const currentFromDB = assignments
      .filter((a) => a.evaluated_id === selectedEvaluated.$id)
      .map((a) => a.evaluator_id);
    
    if (currentFromDB.length > 0) hasEvaluatorsSaved = true;

    const evaluatorsToAssign = Array.from(selectedEvaluatorIds);
    if (!evaluatorsToAssign.includes(selectedEvaluated.$id)) {
      evaluatorsToAssign.push(selectedEvaluated.$id);
    }
    
    if (evaluatorsToAssign.length !== currentFromDB.length) {
      hasChanges = true;
    } else {
      hasChanges = evaluatorsToAssign.some(id => !currentFromDB.includes(id));
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-full divide-y md:divide-y-0 md:divide-x divide-surface-200">
      {/* List of everyone, to choose who to evaluate */}
      <div className="w-full md:w-1/2 flex flex-col h-1/2 md:h-full bg-white">
        <div className="p-4 border-b border-surface-100 bg-surface-50/50 shrink-0">
          <p className="text-xs font-bold text-surface-600 uppercase tracking-wider">1. ¿A quién evaluar en este ciclo?</p>
          <p className="text-xs text-surface-400 mt-1">Selecciona a un colaborador para asignarle sus evaluadores.</p>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {allEmployees.map(emp => {
            const isSelected = selectedEvaluated?.$id === emp.$id;
            const count = assignments.filter((a) => a.evaluated_id === emp.$id && a.evaluator_id !== emp.$id).length;
            const hasSelfEval = assignments.some(a => a.evaluated_id === emp.$id && a.evaluator_id === emp.$id);
            const isInCycle = count > 0 || hasSelfEval;
            return (
              <button
                key={emp.$id}
                onClick={() => selectEmployee(emp)}
                className={`w-full text-left p-3.5 rounded-xl flex items-center justify-between transition-all duration-200 ${
                  isSelected ? 'bg-primary-50 border-primary-300 shadow-md border' : 'hover:bg-white hover:shadow-md hover:-translate-y-0.5 hover:border-primary-200 border-transparent border'
                }`}
              >
                <div>
                  <p className={`text-sm font-medium ${isSelected ? 'text-primary-800' : 'text-surface-700'}`}>{emp.name}</p>
                  <p className="text-[11px] text-surface-400 uppercase tracking-wide mt-0.5">{emp.department ?? 'Sin área'}</p>
                </div>
                {isInCycle && (
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-green-100 text-green-700">{count} evaluadores</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Select Evaluators for the chosen person */}
      <div className="w-full md:w-1/2 flex flex-col h-1/2 md:h-full bg-surface-50">
        {!selectedEvaluated ? (
          <div className="m-auto text-center p-8">
            <div className="w-12 h-12 bg-surface-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
            </div>
            <p className="text-surface-500 text-sm">Selecciona un colaborador a la izquierda para empezar.</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-surface-200 bg-white flex flex-col gap-3 shrink-0">
              <div>
                <p className="text-xs font-bold text-surface-800 uppercase tracking-wider">
                  2. ¿Quién evaluará a <span className="text-primary-600">{selectedEvaluated.name.split(' ')[0]}</span>?
                </p>
                <p className="text-xs text-surface-500 mt-1">La autoevaluación se genera automáticamente.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveAssignments(false)}
                  disabled={saving || (!hasChanges && hasEvaluatorsSaved)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    !hasChanges && hasEvaluatorsSaved
                      ? 'bg-surface-100 text-surface-400 border-surface-200 cursor-not-allowed'
                      : saved && !saving
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-white text-surface-700 border-surface-300 hover:bg-surface-50 hover:border-primary-300'
                  } disabled:opacity-50`}
                >
                  {saving ? '...' : !hasChanges && hasEvaluatorsSaved ? 'Sin cambios' : saved ? '¡Guardado!' : 'Guardar'}
                </button>
                <button
                  onClick={() => saveAssignments(true)}
                  disabled={saving || (!hasChanges && hasEvaluatorsSaved)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm ${
                    !hasChanges && hasEvaluatorsSaved
                      ? 'bg-surface-200 text-surface-500 cursor-not-allowed'
                      : saved && !saving
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-primary-500 text-white hover:bg-primary-600'
                  } disabled:opacity-50`}
                >
                  {saving ? 'Guardando...' : !hasChanges && hasEvaluatorsSaved ? 'Sin cambios' : saved ? '¡Guardado!' : 'Guardar y notificar'}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {candidates.map(emp => {
                const isChecked = selectedEvaluatorIds.has(emp.$id);
                return (
                  <label key={emp.$id} className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${isChecked ? 'bg-white border-primary-300 shadow-md' : 'bg-surface-50/50 border-surface-200 hover:bg-white hover:shadow-md hover:-translate-y-0.5 hover:border-primary-200'}`}>
                    <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleEvaluator(emp.$id)} />
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-primary-500 border-primary-500' : 'bg-white border-surface-300'}`}>
                      {isChecked && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div>
                      <span className={`text-sm block ${isChecked ? 'font-medium text-surface-800' : 'text-surface-600'}`}>{emp.name}</span>
                      <span className="text-[10px] text-surface-400 uppercase tracking-wide">{emp.department ?? 'Sin área'}</span>
                    </div>
                  </label>
                );
              })}
              {candidates.length === 0 && (
                <div className="py-10 text-center text-surface-400 text-sm">
                  No hay otros colaboradores disponibles.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB 2: Resultados ───────────────────────────────────────────────────────

function ResultsTab({
  cycles,
  selectedCycleId,
  onSelectCycle,
  employees,
  allEmployees,
  onViewReport,
  cycleData,
  allQuestions,
}: {
  cycles: EvaluationCycle[];
  selectedCycleId: string;
  onSelectCycle: (id: string) => void;
  employees: EmployeeStats[];
  allEmployees: Employee[];
  onViewReport: (cycleId: string, empId: string) => void;
  cycleData: { responses: Response[]; assignments: EvaluationAssignment[]; comments: any[] } | null;
  allQuestions: any[];
}) {
  const selectedCycle = cycles.find(c => c.$id === selectedCycleId);
  const evaluatedPerson = employees.length > 0 ? employees[0] : null;

  const [isExporting, setIsExporting] = useState(false);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);

  const assignments = cycleData ? cycleData.assignments.filter(a => a.evaluated_id === evaluatedPerson?.$id) : [];
  const responses = cycleData ? cycleData.responses.filter(r => r.evaluated_id === evaluatedPerson?.$id) : [];
  const comments = cycleData ? cycleData.comments.filter(c => c.evaluated_id === evaluatedPerson?.$id) : [];
  const questions = allQuestions;



  async function exportToCSV() {
    if (employees.length === 0 || !selectedCycleId || isExporting || !cycleData) return;
    
    try {
      setIsExporting(true);
      
      const allResponses = cycleData.responses;
      const allComments = cycleData.comments;
      const allEmployeesData = allEmployees;
      
      const empMap = new Map(allEmployeesData.map(e => [e.$id, e]));
      
      const questionHeaders = allQuestions.map(q => `"${q.text.replace(/"/g, '""')}"`);
      const headers = [
        'Evaluado', 
        'Área del Evaluado', 
        'Evaluador', 
        'Área del Evaluador', 
        'Tipo de Evaluación',
        ...questionHeaders,
        'Comentario General',
        'Fortalezas',
        'Oportunidades'
      ];
      
      const rows: string[] = [];
      const evaluations = new Map<string, { evaluatedId: string, evaluatorId: string }>();
      
      allResponses.forEach(r => {
        const key = `${r.evaluated_id}_${r.evaluator_id}`;
        if (!evaluations.has(key)) {
          evaluations.set(key, { evaluatedId: r.evaluated_id, evaluatorId: r.evaluator_id });
        }
      });
      allComments.forEach(c => {
        const key = `${c.evaluated_id}_${c.evaluator_id}`;
        if (!evaluations.has(key)) {
          evaluations.set(key, { evaluatedId: c.evaluated_id, evaluatorId: c.evaluator_id });
        }
      });
      
      Array.from(evaluations.values()).forEach(ev => {
        const evaluated = empMap.get(ev.evaluatedId);
        const evaluator = empMap.get(ev.evaluatorId);
        
        if (!evaluated || !evaluator) return;
        
        const row = [
          `"${evaluated.name}"`,
          `"${evaluated.department || ''}"`,
          `"${evaluator.name}"`,
          `"${evaluator.department || ''}"`,
          `"${ev.evaluatedId === ev.evaluatorId ? 'Autoevaluacion' : 'Colectiva'}"`
        ];
        
        allQuestions.forEach(q => {
          const resp = allResponses.find(r => r.evaluated_id === ev.evaluatedId && r.evaluator_id === ev.evaluatorId && r.question_id === q.$id);
          row.push(resp ? `"${Math.round(resp.score * 100)}%"` : '"N/A"');
        });
        
        const comment = allComments.find(c => c.evaluated_id === ev.evaluatedId && c.evaluator_id === ev.evaluatorId);
        row.push(comment && comment.comment ? `"${comment.comment.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
        row.push(comment && comment.strengths ? `"${comment.strengths.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
        row.push(comment && comment.opportunities ? `"${comment.opportunities.replace(/"/g, '""').replace(/\n/g, ' ')}"` : '""');
        
        rows.push(row.join(','));
      });
      
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
      const link = document.createElement('a');
      link.href = encodeURI(csvContent);
      link.download = `resultados_detallados_${selectedCycle?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() ?? 'ciclo'}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      console.error('Error exportando CSV detallado:', err);
      alert('Hubo un error al exportar los datos detallados.');
    } finally {
      setIsExporting(false);
    }
  }

  if (cycles.length === 0) {
    return <div className="text-center p-10 text-surface-500">No hay ciclos creados.</div>;
  }

  const completedEvaluatorsCount = new Set(responses.map(r => r.evaluator_id)).size;
  const totalEvaluators = assignments.length;
  const pendingCount = totalEvaluators - completedEvaluatorsCount;

  return (
    <div>
      {/* Dropdown to select cycle */}
      <div className="mb-6 flex items-center gap-4 bg-white p-4 rounded-2xl border border-surface-200">
        <label className="text-sm font-semibold text-surface-700">Viendo resultados del ciclo:</label>
        <select 
          value={selectedCycleId} 
          onChange={(e) => onSelectCycle(e.target.value)}
          className="bg-surface-50 border border-surface-200 text-surface-800 text-sm rounded-xl focus:ring-primary-500 focus:border-primary-500 block px-4 py-2 font-medium min-w-[250px]"
        >
          {cycles.map(c => <option key={c.$id} value={c.$id}>{c.name} ({c.status})</option>)}
        </select>
        {selectedCycle && <StatusBadge status={selectedCycle.status} />}
      </div>

      {!cycleData ? (
        <div className="animate-pulse space-y-6">
          <div className="flex flex-col md:flex-row gap-6 mb-6">
            <div className="flex-1 grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-surface-100 rounded-2xl h-28"></div>
              ))}
            </div>
            <div className="flex flex-col gap-3 shrink-0 justify-center w-full md:w-64">
              <div className="h-14 bg-surface-200 rounded-xl"></div>
              <div className="h-10 bg-surface-100 rounded-xl"></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden h-64 flex items-center justify-center bg-surface-50">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner />
              <p className="text-sm font-medium text-surface-400">Cargando resultados...</p>
            </div>
          </div>
        </div>
      ) : !evaluatedPerson ? (
        <div className="bg-white rounded-2xl border border-surface-200 p-16 text-center">
          <p className="text-surface-600 font-medium">Nadie está participando en este ciclo aún.</p>
          <p className="text-surface-400 text-sm mt-1">Ve a la pestaña de "Gestión de Ciclos" y asígnale evaluadores a alguien.</p>
        </div>
      ) : (
        <>
          {/* Stats row & Actions */}
          <div className="flex flex-col md:flex-row gap-6 mb-6">
            <div className="flex-1 grid grid-cols-3 gap-4">
              {[
                { label: 'Evaluadores Asignados', value: totalEvaluators, color: 'text-surface-800' },
                { label: 'Completados', value: completedEvaluatorsCount, color: 'text-green-600' },
                { label: 'Pendientes', value: pendingCount, color: 'text-amber-600' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-2xl border border-surface-200 p-5">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-surface-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col gap-3 shrink-0 justify-center">
              <button
                onClick={() => onViewReport(selectedCycleId, evaluatedPerson.$id)}
                className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold transition-colors shadow-sm"
              >
                Ver Reporte de {evaluatedPerson.name.split(' ')[0]}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              
              <button
                onClick={exportToCSV}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-surface-200 hover:bg-surface-50 text-surface-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? 'Generando CSV...' : 'Descargar Excel Detallado'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100 bg-surface-50/60">
              <h2 className="font-semibold text-surface-800 text-sm">Progreso de Evaluadores para {evaluatedPerson.name}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50/60">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Evaluador</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">Área</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Estatus</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-surface-400 uppercase tracking-wider">Respuestas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-surface-500">No hay evaluadores asignados.</td>
                  </tr>
                ) : (
                  assignments.map((assignment) => {
                    const evaluator = allEmployees.find(e => e.$id === assignment.evaluator_id);
                    if (!evaluator) return null;
                    
                    const hasCompleted = responses.some(r => r.evaluator_id === evaluator.$id);
                    const isSelf = evaluator.$id === evaluatedPerson.$id;
                    
                    return (
                      <tr key={assignment.$id} className="hover:bg-surface-50/50 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-surface-800 flex items-center gap-2">
                              {evaluator.name}
                              {isSelf && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary-100 text-primary-700">Autoevaluación</span>}
                            </span>
                            <span className="text-xs text-surface-400 mt-0.5">{evaluator.position ?? 'Sin puesto'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-surface-600">
                          {evaluator.department ?? '—'}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                            hasCompleted ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {hasCompleted ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                Completado
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Pendiente
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {hasCompleted ? (
                            <button
                              onClick={() => setSelectedEvaluatorId(evaluator.$id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              Ver reporte
                            </button>
                          ) : (
                            <span className="text-xs text-surface-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Modal: Evaluator Report ─────────────────── */}
      {selectedEvaluatorId && evaluatedPerson && (() => {
        const evaluator = allEmployees.find(e => e.$id === selectedEvaluatorId);
        if (!evaluator) return null;
        const evResponses = responses.filter(r => r.evaluator_id === selectedEvaluatorId);
        const evComment = comments.find(c => c.evaluator_id === selectedEvaluatorId);
        const isSelf = selectedEvaluatorId === evaluatedPerson.$id;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSelectedEvaluatorId(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-7 pt-7 pb-5 border-b border-surface-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Reporte de Evaluador</span>
                    {isSelf && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary-100 text-primary-700">Autoevaluación</span>}
                  </div>
                  <h2 className="text-xl font-bold text-surface-800">{evaluator.name}</h2>
                  <p className="text-sm text-surface-400 mt-0.5">
                    {evaluator.position ?? 'Sin puesto'} • {evaluator.department ?? 'Sin área'}
                  </p>
                  <p className="text-xs text-surface-400 mt-2">
                    Evaluando a: <span className="font-semibold text-surface-600">{evaluatedPerson.name}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEvaluatorId(null)}
                  className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

                <div className="flex-1 overflow-y-auto">
                  {/* Resumen / KPIs */}
                  <div className="px-7 py-5 bg-surface-50 border-b border-surface-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-1">Resumen de la evaluación</h3>
                      <p className="text-sm text-surface-600">Basado en las {evResponses.length} respuestas proporcionadas.</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-0.5">Completitud</p>
                        <p className="text-xl font-bold text-surface-800">{evResponses.length > 0 ? '100%' : '0%'}</p>
                      </div>
                      <div className="w-px h-8 bg-surface-200"></div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-0.5">Calificación Promedio</p>
                        <p className={`text-xl font-bold ${evResponses.length === 0 ? 'text-surface-400' : (() => {
                          const avg = evResponses.reduce((acc, r) => acc + r.score, 0) / evResponses.length;
                          return avg >= 0.75 ? 'text-green-600' : avg >= 0.50 ? 'text-amber-600' : 'text-red-600';
                        })()}`}>
                          {evResponses.length > 0 
                            ? Math.round((evResponses.reduce((acc, r) => acc + r.score, 0) / evResponses.length) * 100) + '%' 
                            : 'N/A'
                          }
                        </p>
                      </div>
                    </div>
                  </div>


                  {evResponses.length > 0 && (
                    <div className="px-7 py-6 bg-surface-50/50 border-b border-surface-100">
                      {/* Top 3 and Bottom 3 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            Top 3 Fortalezas
                          </h3>
                          <ul className="space-y-2">
                            {[...evResponses]
                              .sort((a, b) => b.score - a.score)
                              .slice(0, 3)
                              .map((r, i) => {
                                const q = questions.find(q => q.$id === r.question_id);
                                return (
                                  <li key={i} className="text-sm text-surface-700 flex items-start gap-2">
                                    <span className="font-bold text-green-600 w-8 shrink-0">{Math.round(r.score * 100)}%</span>
                                    <span>{q?.text}</span>
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                            Top 3 Áreas de Oportunidad
                          </h3>
                          <ul className="space-y-2">
                            {[...evResponses]
                              .sort((a, b) => a.score - b.score)
                              .slice(0, 3)
                              .map((r, i) => {
                                const q = questions.find(q => q.$id === r.question_id);
                                return (
                                  <li key={i} className="text-sm text-surface-700 flex items-start gap-2">
                                    <span className="font-bold text-amber-600 w-8 shrink-0">{Math.round(r.score * 100)}%</span>
                                    <span>{q?.text}</span>
                                  </li>
                                );
                              })}
                          </ul>
                        </div>
                      </div>

                      {/* Resultados por Categoría */}
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">Resultados por Categoría</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {CATEGORY_ORDER.map(cat => {
                            const catQuestions = questions.filter(q => q.category === cat);
                            const catResponses = evResponses.filter(r => catQuestions.some(q => q.$id === r.question_id));
                            if (catResponses.length === 0) return null;
                            const catScore = catResponses.reduce((acc, r) => acc + r.score, 0) / catResponses.length;
                            const color = catScore >= 0.75 ? 'text-green-700 bg-green-50 border-green-200' : catScore >= 0.50 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-red-700 bg-red-50 border-red-200';
                            return (
                              <div key={cat} className={`p-3 rounded-xl border ${color} flex flex-col justify-between`}>
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-2 opacity-80">{CATEGORY_LABELS[cat]}</span>
                                <span className="text-lg font-bold">{Math.round(catScore * 100)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="px-7 py-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Respuestas por pregunta</h3>
                {questions.length === 0 ? (
                  <p className="text-surface-500 text-sm">Cargando preguntas...</p>
                ) : (
                  questions.map((q, idx) => {
                    const resp = evResponses.find(r => r.question_id === q.$id);
                    const pct = resp ? Math.round(resp.score * 100) : null;
                    const color = pct === null ? 'bg-surface-100' : pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
                    return (
                      <div key={q.$id} className="flex items-center gap-4">
                        <span className="text-xs text-surface-400 w-5 shrink-0 text-right">{idx + 1}</span>
                        <p className="flex-1 text-sm text-surface-700">{q.text}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-24 h-2 rounded-full bg-surface-100 overflow-hidden">
                            <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: pct !== null ? `${pct}%` : '0%' }} />
                          </div>
                          <span className={`text-xs font-bold w-10 text-right ${pct === null ? 'text-surface-400' : pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                            {pct !== null ? `${pct}%` : 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Comment */}
              <div className="px-7 pb-7">
                <div className="border-t border-surface-100 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Comentarios Adicionales</h3>
                  <div className="flex flex-col gap-4">
                    {evComment && (evComment.comment || evComment.strengths || evComment.opportunities) ? (
                      <>
                        {evComment.comment && (
                          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-1">General</p>
                            <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.comment}</p>
                          </div>
                        )}
                        {evComment.strengths && (
                          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-1">Fortalezas</p>
                            <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.strengths}</p>
                          </div>
                        )}
                        {evComment.opportunities && (
                          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-1">Oportunidades de mejora</p>
                            <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{evComment.opportunities}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-surface-400 italic">Este evaluador no dejó comentarios adicionales.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}


// Removed ProgressTab
