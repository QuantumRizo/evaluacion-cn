export type UserRole = 'admin' | 'employee';
export type EvaluationType = 'self' | 'peer';
export type CycleStatus = 'draft' | 'active' | 'closed';
export type QuestionCategory =
  | 'orientacion_resultados'
  | 'pensamiento_estrategico'
  | 'calidad_mejora_continua'
  | 'relaciones_interpersonales'
  | 'iniciativa'
  | 'trabajo_equipo'
  | 'organizacion'
  | 'comunicacion';

export interface Employee {
  $id: string;
  name: string;
  email: string;
  department?: string;
  position?: string;
  role: UserRole;
  auth_user_id?: string;
  is_active?: boolean;
}

export interface EvaluationCycle {
  $id: string;
  name: string;
  description?: string;
  status: CycleStatus;
  start_date?: string;
  end_date?: string;
  evaluated_employee_id?: string;
}

export interface Question {
  $id: string;
  text: string;
  category: QuestionCategory;
  max_score: number;
  order: number;
  is_inverted: boolean;
}

export interface Response {
  $id: string;
  cycle_id: string;
  question_id: string;
  evaluator_id: string;
  evaluated_id: string;
  score: number;
  evaluation_type: EvaluationType;
}

export interface EvaluationComment {
  $id: string;
  cycle_id: string;
  evaluator_id: string;
  evaluated_id: string;
  evaluation_type: EvaluationType;
  comment?: string;
  strengths?: string;
  opportunities?: string;
}

export interface FinalReport {
  $id: string;
  cycle_id: string;
  employee_id: string;
  self_score?: number;
  collective_score?: number;
  admin_summary?: string;
  strengths?: string;
  opportunities?: string;
  final_score?: number;
  is_exported: boolean;
}

export interface EvaluationAssignment {
  $id: string;
  cycle_id: string;
  evaluated_id: string;
  evaluator_id: string;
}

/** Score breakdown per category used in reporting */
export interface CategoryScore {
  category: string;
  selfScore: number | null;
  collectiveScore: number | null;
  questionCount: number;
}
