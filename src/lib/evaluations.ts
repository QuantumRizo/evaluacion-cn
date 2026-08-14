import type { EvaluationComment, Question, Response } from '../types';

export function hasRequiredComments(comment?: EvaluationComment): boolean {
  return (comment?.strengths?.trim().length ?? 0) > 0 &&
    (comment?.opportunities?.trim().length ?? 0) > 0;
}

export function hasAllRequiredResponses(
  responses: Response[],
  questions: Question[],
): boolean {
  if (questions.length === 0) return false;
  const answeredQuestionIds = new Set(responses.map((response) => response.question_id));
  return questions.every((question) => answeredQuestionIds.has(question.$id));
}

export function uniqueResponsesByEvaluatorAndQuestion(responses: Response[]): Response[] {
  const uniqueResponses = new Map<string, Response>();
  for (const response of responses) {
    uniqueResponses.set(`${response.evaluator_id}:${response.question_id}`, response);
  }
  return Array.from(uniqueResponses.values());
}
