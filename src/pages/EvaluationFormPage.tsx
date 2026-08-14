import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, fetchAllDocuments, Query } from '../lib/appwrite';
import { ID } from 'appwrite';
import { DB_ID, COLLECTIONS, SCORE_OPTIONS, CATEGORY_ORDER, CATEGORY_LABELS } from '../lib/constants';
import { hasAllRequiredResponses, hasRequiredComments } from '../lib/evaluations';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import type { Employee, EvaluationCycle, Question, EvaluationComment, Response as EvaluationResponse } from '../types';

type Answers = Record<string, number>;

export default function EvaluationFormPage() {
  const { cycleId, evaluatedId } = useParams<{ cycleId: string; evaluatedId: string }>();
  const { employee: currentEmployee } = useAuth();
  const navigate = useNavigate();

  const [evaluatedEmployee, setEvaluatedEmployee] = useState<Employee | null>(null);
  const [cycle, setCycle] = useState<EvaluationCycle | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [strengths, setStrengths] = useState('');
  const [opportunities, setOpportunities] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [alreadyCommented, setAlreadyCommented] = useState(false);
  const [existingResponses, setExistingResponses] = useState<EvaluationResponse[]>([]);
  const [existingCommentDocs, setExistingCommentDocs] = useState<EvaluationComment[]>([]);
  const [existingCommentDoc, setExistingCommentDoc] = useState<EvaluationComment | null>(null);
  const [error, setError] = useState('');
  const [commentSaved, setCommentSaved] = useState(false);

  const isSelf = evaluatedId === currentEmployee?.$id;

  async function loadData() {
    try {
      const [empDoc, cycleDoc, allQuestions, responseDocs, commentDocs] = await Promise.all([
        databases.getDocument(DB_ID, COLLECTIONS.EMPLOYEES, evaluatedId!),
        databases.getDocument(DB_ID, COLLECTIONS.EVALUATION_CYCLES, cycleId!),
        fetchAllDocuments<Question>(COLLECTIONS.QUESTIONS, [Query.orderAsc('order')]),
        fetchAllDocuments<EvaluationResponse>(COLLECTIONS.RESPONSES, [
          Query.equal('evaluator_id', currentEmployee!.$id),
          Query.equal('evaluated_id', evaluatedId!),
          Query.equal('cycle_id', cycleId!),
        ]),
        fetchAllDocuments<EvaluationComment>(COLLECTIONS.EVALUATION_COMMENTS, [
          Query.equal('evaluator_id', currentEmployee!.$id),
          Query.equal('evaluated_id', evaluatedId!),
          Query.equal('cycle_id', cycleId!),
        ]),
      ]);

      setEvaluatedEmployee(empDoc as unknown as Employee);
      setCycle(cycleDoc as unknown as EvaluationCycle);
      setQuestions(allQuestions);
      setExistingResponses(responseDocs);
      setExistingCommentDocs(commentDocs);

      const savedAnswers: Answers = {};
      for (const response of responseDocs) {
        savedAnswers[response.question_id] = response.score;
      }
      setAnswers(savedAnswers);
      setAlreadyDone(hasAllRequiredResponses(responseDocs, allQuestions));

      const commentDoc = commentDocs.find(hasRequiredComments) ?? commentDocs[0] ?? null;
      setExistingCommentDoc(commentDoc);
      setAlreadyCommented(hasRequiredComments(commentDoc));
      setStrengths(commentDoc?.strengths ?? '');
      setOpportunities(commentDoc?.opportunities ?? '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial remote data load for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentEmployee && evaluatedId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmployee, cycleId, evaluatedId]);

  function setAnswer(questionId: string, rawValue: number, isInverted: boolean) {
    const score = isInverted ? 1.25 - rawValue : rawValue;
    setAnswers((prev) => ({ ...prev, [questionId]: score }));
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;
  const allAnswered = answeredCount === totalQuestions && totalQuestions > 0;
  const canSubmit = allAnswered && strengths.trim().length > 0 && opportunities.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || !cycle || !currentEmployee) return;
    setSubmitting(true);
    setError('');

    let transactionId: string | null = null;
    try {
      const evaluationType = isSelf ? 'self' : 'peer';

      const transaction = await databases.createTransaction();
      transactionId = transaction.$id;

      // Replace any partial or duplicated attempt atomically.
      for (const response of existingResponses) {
        await databases.deleteDocument(DB_ID, COLLECTIONS.RESPONSES, response.$id, transactionId);
      }

      for (const question of questions) {
        await databases.createDocument(DB_ID, COLLECTIONS.RESPONSES, ID.unique(), {
          cycle_id: cycle.$id,
          question_id: question.$id,
          evaluator_id: currentEmployee.$id,
          evaluated_id: evaluatedId,
          score: answers[question.$id],
          evaluation_type: evaluationType,
        }, undefined, transactionId);
      }

      // Save comment (required)
      const commentData = {
        comment: '',
        strengths: strengths.trim(),
        opportunities: opportunities.trim(),
      };

      if (existingCommentDoc) {
        await databases.updateDocument(
          DB_ID,
          COLLECTIONS.EVALUATION_COMMENTS,
          existingCommentDoc.$id,
          commentData,
          undefined,
          transactionId,
        );
      } else {
        await databases.createDocument(DB_ID, COLLECTIONS.EVALUATION_COMMENTS, ID.unique(), {
          cycle_id: cycle.$id,
          evaluator_id: currentEmployee.$id,
          evaluated_id: evaluatedId,
          evaluation_type: evaluationType,
          ...commentData,
        }, undefined, transactionId);
      }

      for (const duplicateComment of existingCommentDocs) {
        if (duplicateComment.$id !== existingCommentDoc?.$id) {
          await databases.deleteDocument(
            DB_ID,
            COLLECTIONS.EVALUATION_COMMENTS,
            duplicateComment.$id,
            transactionId,
          );
        }
      }

      await databases.updateTransaction(transactionId, true);

      navigate('/evaluaciones', { state: { submitted: true } });
    } catch (err) {
      if (transactionId) {
        try {
          await databases.updateTransaction(transactionId, false, true);
        } catch {
          // The transaction may already have expired or rolled back automatically.
        }
      }
      console.error(err);
      setError('Ocurrió un error al guardar. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  async function handleSaveComment() {
    if (!strengths.trim() || !opportunities.trim() || !cycle || !currentEmployee) return;
    setSubmittingComment(true);
    setError('');

    try {
      const evaluationType = isSelf ? 'self' : 'peer';

      if (existingCommentDoc) {
        // Update existing comment
        await databases.updateDocument(DB_ID, COLLECTIONS.EVALUATION_COMMENTS, existingCommentDoc.$id, {
          comment: '',
          strengths: strengths.trim(),
          opportunities: opportunities.trim(),
        });
      } else {
        // Create new comment
        await databases.createDocument(DB_ID, COLLECTIONS.EVALUATION_COMMENTS, ID.unique(), {
          cycle_id: cycle.$id,
          evaluator_id: currentEmployee.$id,
          evaluated_id: evaluatedId,
          evaluation_type: evaluationType,
          comment: '',
          strengths: strengths.trim(),
          opportunities: opportunities.trim(),
        });
      }

      setCommentSaved(true);
      setAlreadyCommented(true);
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar el comentario. Intenta de nuevo.');
    } finally {
      setSubmittingComment(false);
    }
  }

  // Group questions by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, Question[]>>((acc, cat) => {
    const catQuestions = questions.filter((q) => q.category === cat);
    if (catQuestions.length > 0) acc[cat] = catQuestions;
    return acc;
  }, {});

  if (loading) return <div className="min-h-screen bg-surface-100 md:pl-64"><Navbar /><LoadingSpinner fullPage /></div>;

  // Already evaluated AND already left a comment → show completed screen
  if (alreadyDone && alreadyCommented && !commentSaved) {
    return (
      <div className="min-h-screen bg-surface-100 md:pl-64">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-surface-800 mb-2">
            Evaluación completada
          </h2>
          <p className="text-surface-400 text-sm mb-6">
            Ya registraste tu evaluación y comentario para{' '}
            <strong className="text-surface-700">
              {isSelf ? 'ti mismo' : evaluatedEmployee?.name}
            </strong>{' '}
            en este ciclo.
          </p>
          {existingCommentDoc && (
            <div className="bg-white border border-surface-200 rounded-2xl px-5 py-4 text-left mb-6">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-1">Fortalezas</p>
                <p className="text-sm text-surface-700 leading-relaxed">{existingCommentDoc.strengths || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-1">Oportunidades de mejora</p>
                <p className="text-sm text-surface-700 leading-relaxed">{existingCommentDoc.opportunities || 'N/A'}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => navigate('/evaluaciones')}
            className="px-5 py-2.5 rounded-xl bg-surface-800 text-white text-sm font-medium hover:bg-surface-900 transition-colors"
          >
            Volver a mis evaluaciones
          </button>
        </div>
      </div>
    );
  }

  // Already evaluated but NO comment yet → show comment-only form
  if (alreadyDone && !commentSaved) {
    return (
      <div className="min-h-screen bg-surface-100 md:pl-64">
        <Navbar />
        <main className="max-w-2xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/evaluaciones')}
              className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-700 transition-colors mb-4"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver
            </button>

            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-surface-800">
                Evaluación ya enviada
              </h1>
            </div>
            {!isSelf && evaluatedEmployee?.position && (
              <span className="inline-flex items-center ml-11 mt-1 px-2.5 py-0.5 rounded-full bg-surface-200 text-surface-500 text-xs font-medium">
                {evaluatedEmployee.position}
              </span>
            )}
            <p className="text-surface-400 text-sm mt-1 ml-11">
              Ya completaste la evaluación de{' '}
              <strong className="text-surface-700">{isSelf ? 'ti mismo' : evaluatedEmployee?.name}</strong>.
              Puedes dejar un comentario adicional a continuación.
            </p>
          </div>

          {/* Comment only form */}
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100">
              <h3 className="text-sm font-semibold text-surface-800">Comentarios Adicionales</h3>
              <p className="text-xs text-surface-400 mt-0.5">Completa los campos para terminar tu evaluación</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Fortalezas</label>
                <textarea
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  placeholder="¿Qué hace excepcionalmente bien?"
                  rows={3}
                  maxLength={2000}
                  className="w-full resize-none rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700 placeholder-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Oportunidades de Mejora</label>
                <textarea
                  value={opportunities}
                  onChange={(e) => setOpportunities(e.target.value)}
                  placeholder="¿En qué áreas podría mejorar?"
                  rows={3}
                  maxLength={2000}
                  className="w-full resize-none rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700 placeholder-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => navigate('/evaluaciones')}
              className="px-5 py-2.5 rounded-xl border border-surface-200 text-surface-600 text-sm font-medium hover:bg-surface-100 transition-colors"
            >
              Omitir
            </button>
            <button
              onClick={handleSaveComment}
              disabled={!strengths.trim() || !opportunities.trim() || submittingComment}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-surface-200 disabled:text-surface-400 text-white text-sm font-semibold transition-all duration-200"
            >
              {submittingComment ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar comentario'
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Comment just saved → show confirmation
  if (commentSaved) {
    return (
      <div className="min-h-screen bg-surface-100 md:pl-64">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-surface-800 mb-2">¡Comentario guardado!</h2>
          <p className="text-surface-400 text-sm mb-6">
            Tu comentario fue registrado exitosamente.
          </p>
          <button
            onClick={() => navigate('/evaluaciones')}
            className="px-5 py-2.5 rounded-xl bg-surface-800 text-white text-sm font-medium hover:bg-surface-900 transition-colors"
          >
            Volver a mis evaluaciones
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-100 md:pl-64">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/evaluaciones')}
            className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-700 transition-colors mb-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver
          </button>

          <h1 className="text-2xl font-bold text-surface-800">
            {isSelf ? 'Autoevaluación' : `Evaluando a ${evaluatedEmployee?.name}`}
          </h1>
          {!isSelf && evaluatedEmployee?.position && (
            <span className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full bg-surface-200 text-surface-500 text-xs font-medium">
              {evaluatedEmployee.position}
            </span>
          )}
          <p className="text-surface-400 text-sm mt-1.5">
            {isSelf
              ? 'Evalúa tu propio desempeño con honestidad y reflexión.'
              : `Evalúa el desempeño de ${evaluatedEmployee?.name} en el ciclo actual.`}
          </p>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-2xl border border-surface-200 px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-surface-400">Preguntas respondidas</p>
            <p className="text-sm font-semibold text-surface-800 mt-0.5">
              {answeredCount} de {totalQuestions}
            </p>
          </div>
          <div className="w-40 h-1.5 bg-surface-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([category, catQuestions]) => (
            <CategorySection
              key={category}
              category={category}
              questions={catQuestions}
              answers={answers}
              onAnswer={setAnswer}
            />
          ))}
        </div>

        {/* Open comment section */}
        <div className="mt-6 bg-white rounded-2xl border border-surface-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Comentarios Adicionales</h3>
            <p className="text-xs text-surface-400 mt-0.5">Obligatorio — observaciones y feedback sobre esta evaluación</p>
          </div>
          <div className="px-6 py-5 flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Fortalezas</label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="¿Cuáles son las principales fortalezas?"
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700 placeholder-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Oportunidades de Mejora</label>
              <textarea
                value={opportunities}
                onChange={(e) => setOpportunities(e.target.value)}
                placeholder="¿Qué áreas de oportunidad identificas?"
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700 placeholder-surface-300 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6 flex flex-col items-end gap-3">
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          {!allAnswered && answeredCount > 0 && (
            <p className="text-xs text-surface-400">
              Responde todas las preguntas para enviar.
            </p>
          )}
          {allAnswered && (!strengths.trim() || !opportunities.trim()) && (
            <p className="text-xs text-amber-500">
              Todos los comentarios son obligatorios para enviar la evaluación.
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-surface-200 disabled:text-surface-400 text-white text-sm font-semibold transition-all duration-200"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar evaluación'
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

function CategorySection({
  category,
  questions,
  answers,
  onAnswer,
}: {
  category: string;
  questions: Question[];
  answers: Answers;
  onAnswer: (id: string, rawValue: number, inverted: boolean) => void;
}) {
  const label = CATEGORY_LABELS[category] ?? category;
  const answered = questions.filter((q) => q.$id in answers).length;

  return (
    <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
      {/* Category header */}
      <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-800">{label}</h3>
        <span className="text-xs text-surface-400">
          {answered}/{questions.length}
        </span>
      </div>

      {/* Questions */}
      <div className="divide-y divide-surface-50">
        {questions.map((q, idx) => (
          <QuestionRow
            key={q.$id}
            index={idx + 1}
            question={q}
            selectedRaw={
              // Reverse-compute raw display value
              q.$id in answers
                ? q.is_inverted
                  ? 1.25 - answers[q.$id]
                  : answers[q.$id]
                : undefined
            }
            onSelect={(rawValue) => onAnswer(q.$id, rawValue, q.is_inverted)}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  selectedRaw,
  onSelect,
}: {
  index: number;
  question: Question;
  selectedRaw: number | undefined;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-sm text-surface-700 mb-4 leading-relaxed">
        <span className="text-surface-300 font-medium mr-2">{index}.</span>
        {question.text}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SCORE_OPTIONS.map((opt) => {
          const isSelected = selectedRaw === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all duration-150 ${
                isSelected
                  ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                  : 'bg-surface-50 border-surface-200 text-surface-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
