import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, fetchAllDocuments, Query } from '../lib/appwrite';
import { DB_ID, COLLECTIONS } from '../lib/constants';
import { hasAllRequiredResponses, hasRequiredComments } from '../lib/evaluations';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import type { Employee, EvaluationCycle, EvaluationAssignment, EvaluationComment, Question, Response } from '../types';

type TaskType = 'self' | 'peer';

interface Task {
  id: string;
  type: TaskType;
  cycle: EvaluationCycle;
  targetEmployee: Employee;
  done: boolean;
  hasResponses: boolean;
  hasComment: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

function getFirstName(name?: string) {
  return name?.split(' ')[0] ?? 'Colaborador';
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function EvaluationsPage() {
  const { employee: currentEmployee } = useAuth();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    try {
      // 1. Get ALL active cycles
      const cycleResult = await databases.listDocuments(DB_ID, COLLECTIONS.EVALUATION_CYCLES, [
        Query.equal('status', 'active')
      ]);
      const activeCycles = cycleResult.documents as unknown as EvaluationCycle[];
      const activeCycleIds = activeCycles.map(c => c.$id);

      if (activeCycleIds.length === 0 || !currentEmployee) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Load assignments, submitted data and the current required question set.
      const [asEvaluator, asEvaluated, myResponses, myComments, allEmps, allQuestions] = await Promise.all([
        fetchAllDocuments<EvaluationAssignment>(COLLECTIONS.EVALUATION_ASSIGNMENTS, [Query.equal('evaluator_id', currentEmployee.$id)]),
        fetchAllDocuments<EvaluationAssignment>(COLLECTIONS.EVALUATION_ASSIGNMENTS, [Query.equal('evaluated_id', currentEmployee.$id)]),
        fetchAllDocuments<Response>(COLLECTIONS.RESPONSES, [Query.equal('evaluator_id', currentEmployee.$id)]),
        fetchAllDocuments<EvaluationComment>(COLLECTIONS.EVALUATION_COMMENTS, [Query.equal('evaluator_id', currentEmployee.$id)]),
        fetchAllDocuments<Employee>(COLLECTIONS.EMPLOYEES, [Query.orderAsc('name')]),
        fetchAllDocuments<Question>(COLLECTIONS.QUESTIONS),
      ]);

      const generatedTasks: Task[] = [];

      // Build tasks grouped by active cycles
      for (const cycle of activeCycles) {
        // Did I get assigned evaluators in this cycle? If so, I must do self-evaluation.
        const needsSelf = asEvaluated.some(a => a.cycle_id === cycle.$id);
        if (needsSelf) {
          const evaluationResponses = myResponses.filter(r =>
            r.cycle_id === cycle.$id && r.evaluated_id === currentEmployee.$id
          );
          const hasResponses = hasAllRequiredResponses(evaluationResponses, allQuestions);
          const hasComment = myComments.some(c => 
            c.cycle_id === cycle.$id && 
            c.evaluated_id === currentEmployee.$id &&
            hasRequiredComments(c)
          );
          const done = hasResponses && hasComment;
          generatedTasks.push({
            id: `self_${cycle.$id}`,
            type: 'self',
            cycle,
            targetEmployee: currentEmployee,
            done,
            hasResponses,
            hasComment,
          });
        }

        // Did I get assigned to evaluate peers in this cycle?
        const myPeerAssignments = asEvaluator.filter(a => a.cycle_id === cycle.$id && a.evaluated_id !== currentEmployee.$id);
        for (const a of myPeerAssignments) {
          const evaluationResponses = myResponses.filter(r =>
            r.cycle_id === cycle.$id && r.evaluated_id === a.evaluated_id
          );
          const hasResponses = hasAllRequiredResponses(evaluationResponses, allQuestions);
          const hasComment = myComments.some(c => 
            c.cycle_id === cycle.$id && 
            c.evaluated_id === a.evaluated_id &&
            hasRequiredComments(c)
          );
          const done = hasResponses && hasComment;
          const targetEmployee = allEmps.find(e => e.$id === a.evaluated_id);
          if (targetEmployee) {
            generatedTasks.push({
              id: `peer_${cycle.$id}_${targetEmployee.$id}`,
              type: 'peer',
              cycle,
              targetEmployee,
              done,
              hasResponses,
              hasComment,
            });
          }
        }
      }

      setTasks(generatedTasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial remote task load for the authenticated employee.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentEmployee) loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmployee]);

  const completedCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;
  const pendingCount = totalCount - completedCount;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const pendingTasks = tasks.filter(t => !t.done && !t.hasResponses);
  const needsCommentTasks = tasks.filter(t => !t.done && t.hasResponses && !t.hasComment);
  const completedTasks = tasks.filter(t => t.done);

  // How many distinct active cycles do I have tasks in?
  const uniqueCycles = new Set(tasks.map(t => t.cycle.$id)).size;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-100 md:pl-64 flex items-center justify-center">
        <Navbar />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-100 md:pl-64">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Header greeting ── */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-surface-800 tracking-tight">
            {getGreeting()}, {getFirstName(currentEmployee?.name)}
          </h1>
          <p className="text-surface-400 text-sm mt-1">
            {uniqueCycles > 0
              ? `Tienes tareas pendientes en ${uniqueCycles} ciclo${uniqueCycles !== 1 ? 's' : ''} activo${uniqueCycles !== 1 ? 's' : ''}.`
              : 'Actualmente no tienes tareas asignadas.'}
          </p>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-surface-200">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-surface-800 font-bold text-lg">Todo al día</p>
            <p className="text-surface-400 text-sm mt-1">No tienes evaluaciones pendientes en ningún ciclo activo.</p>
          </div>
        ) : (
          <>
            {/* ── Progress card ── */}
            <div className="bg-white rounded-2xl border border-surface-200 p-6 mb-8 shadow-xs">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-4">
                Progreso General
              </p>
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                  <p className="text-4xl font-bold text-surface-800 mb-2">{percent}%</p>
                  <p className="text-xs text-surface-400 mb-3">
                    {completedCount} de {totalCount} evaluaciones completadas
                  </p>
                  <div className="w-full h-2 bg-surface-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-8 md:gap-12 shrink-0">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary-500">{completedCount}</p>
                    <p className="text-xs text-surface-400 mt-0.5">Completadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
                    <p className="text-xs text-surface-400 mt-0.5">Pendientes</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Task List ── */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50">
                <h2 className="font-semibold text-surface-800">Tus Evaluaciones</h2>
                <span className="text-xs font-medium text-surface-500">{totalCount} Tareas</span>
              </div>

              {/* Pending */}
              {pendingTasks.length > 0 && (
                <div>
                  <div className="px-5 py-2.5 bg-surface-50 border-b border-surface-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Pendientes · {pendingTasks.length}</span>
                  </div>
                  <div className="divide-y divide-surface-50">
                    {pendingTasks.map(t => (
                      <TaskRow key={t.id} task={t} onClick={() => navigate(`/evaluar/${t.cycle.$id}/${t.targetEmployee.$id}`)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Needs Comment */}
              {needsCommentTasks.length > 0 && (
                <div>
                  <div className="px-5 py-2.5 bg-amber-50 border-t border-b border-amber-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Falta comentario · {needsCommentTasks.length}</span>
                  </div>
                  <div className="divide-y divide-surface-50">
                    {needsCommentTasks.map(t => (
                      <TaskRow key={t.id} task={t} onClick={() => navigate(`/evaluar/${t.cycle.$id}/${t.targetEmployee.$id}`)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed */}
              {completedTasks.length > 0 && (
                <div>
                  <div className="px-5 py-2.5 bg-surface-50 border-t border-b border-surface-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-green-600">Completadas · {completedTasks.length}</span>
                  </div>
                  <div className="divide-y divide-surface-50">
                    {completedTasks.map(t => (
                      <TaskRow key={t.id} task={t} onClick={() => {}} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ── Sub-component ── */

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const isSelf = task.type === 'self';
  const daysLeft = daysUntil(task.cycle.end_date);
  const needsComment = task.hasResponses && !task.hasComment;
  const isClickable = !task.done;

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`w-full flex items-center justify-between px-5 py-4 transition-colors duration-150 text-left ${
        task.done ? 'opacity-60 cursor-default' : 'hover:bg-surface-50 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          task.done ? 'bg-green-50 text-green-600'
          : needsComment ? 'bg-amber-50 text-amber-600'
          : isSelf ? 'bg-blue-50 text-blue-600'
          : 'bg-primary-50 text-primary-600'
        }`}>
          {task.done ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          ) : needsComment ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          ) : isSelf ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-sm font-bold text-surface-800">
            {isSelf ? 'Autoevaluación' : `Evaluar a ${task.targetEmployee.name}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-surface-100 text-surface-600">
              Ciclo: {task.cycle.name}
            </span>
            {!task.done && task.cycle.end_date && (
              <span className={`text-[11px] font-medium ${daysLeft === 0 ? 'text-red-500' : 'text-surface-400'}`}>
                {daysLeft === 0 ? 'Vence hoy' : `Vence en ${daysLeft} días`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action */}
      {task.done ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-[11px] font-bold uppercase tracking-wider shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Completada
        </span>
      ) : needsComment ? (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold transition-colors shrink-0">
          Agregar comentario
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-800 text-white hover:bg-surface-900 text-xs font-semibold transition-colors shrink-0">
          Iniciar
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </span>
      )}
    </button>
  );
}
