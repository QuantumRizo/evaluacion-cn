import { Client, Databases, Query } from 'node-appwrite';

const appwrite = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(appwrite);
const sourceDb = 'evaluacion_desempeno';
const targetUrl = process.env.SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const collections = ['employees', 'evaluation_cycles', 'questions', 'responses', 'final_reports', 'evaluation_assignments', 'evaluation_comments'];
const columns = {
  employees: ['id', 'name', 'email', 'department', 'position', 'role', 'auth_user_id', 'is_active', 'created_at', 'updated_at'],
  evaluation_cycles: ['id', 'name', 'description', 'status', 'start_date', 'end_date', 'evaluated_employee_id', 'created_at', 'updated_at'],
  questions: ['id', 'text', 'category', 'max_score', 'order', 'is_inverted', 'created_at', 'updated_at'],
  responses: ['id', 'cycle_id', 'question_id', 'evaluator_id', 'evaluated_id', 'score', 'evaluation_type', 'created_at', 'updated_at'],
  final_reports: ['id', 'cycle_id', 'employee_id', 'self_score', 'collective_score', 'admin_summary', 'strengths', 'opportunities', 'final_score', 'is_exported', 'created_at', 'updated_at'],
  evaluation_assignments: ['id', 'cycle_id', 'evaluated_id', 'evaluator_id', 'created_at', 'updated_at'],
  evaluation_comments: ['id', 'cycle_id', 'evaluator_id', 'evaluated_id', 'evaluation_type', 'comment', 'strengths', 'opportunities', 'created_at', 'updated_at'],
};

if (!process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY || !targetUrl || !targetKey) {
  throw new Error('Faltan variables de entorno de origen o destino.');
}

function toRow(document) {
  const { $id, $createdAt, $updatedAt, ...rawAttributes } = document;
  const attributes = Object.fromEntries(Object.entries(rawAttributes).filter(([key, value]) => !key.startsWith('$') && value !== null));
  return { ...attributes, id: $id, created_at: $createdAt, updated_at: $updatedAt };
}

async function allDocuments(collectionId) {
  const result = [];
  let cursor;
  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(sourceDb, collectionId, queries);
    result.push(...page.documents);
    if (page.documents.length < 100) return result;
    cursor = page.documents.at(-1).$id;
  }
}

async function upsert(collectionId, rows) {
  if (!rows.length) return;
  const response = await fetch(`${targetUrl}/rest/v1/${collectionId}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: targetKey,
      Authorization: `Bearer ${targetKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`${collectionId}: ${response.status} ${await response.text()}`);
}

for (const collection of collections) {
  const documents = await allDocuments(collection);
  const rows = documents.map(toRow).map((row) => Object.fromEntries(columns[collection].map((column) => [column, column === 'is_active' ? row[column] ?? true : row[column] ?? null])));
  await upsert(collection, rows);
  console.log(`${collection}: ${documents.length} registros migrados`);
}
