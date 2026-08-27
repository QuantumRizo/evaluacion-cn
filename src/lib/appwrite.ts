import { createClient, type User } from '@supabase/supabase-js';
import { DB_ID } from './constants';

// Temporary compatibility facade: the UI can keep its existing data calls while
// storage and authentication are served by Supabase.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
export type AppUser = User & { $id: string };
export const account = {
  get: async (): Promise<AppUser> => { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw error ?? new Error('No active session'); return Object.assign(data.user, { $id: data.user.id }); },
  createEmailPasswordSession: async (email: string, password: string) => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; },
  deleteSession: async (...args: unknown[]) => { void args; const { error } = await supabase.auth.signOut(); if (error) throw error; },
};

type QuerySpec = { kind: 'eq' | 'order' | 'limit' | 'cursor'; field?: string; value?: unknown; ascending?: boolean };
export const Query = {
  equal: (field: string, value: unknown): QuerySpec => ({ kind: 'eq', field, value }),
  orderAsc: (field: string): QuerySpec => ({ kind: 'order', field, ascending: true }),
  orderDesc: (field: string): QuerySpec => ({ kind: 'order', field, ascending: false }),
  limit: (value: number): QuerySpec => ({ kind: 'limit', value }),
  cursorAfter: (value: string): QuerySpec => ({ kind: 'cursor', value }),
};

const toRow = (data: Record<string, unknown>) => {
  const { $id, $createdAt, $updatedAt, ...rest } = data;
  return {
    ...rest,
    ...($id !== undefined ? { id: $id } : {}),
    ...($createdAt !== undefined ? { created_at: $createdAt } : {}),
    ...($updatedAt !== undefined ? { updated_at: $updatedAt } : {}),
  };
};
const fromRow = <T>(row: Record<string, unknown>): T => { const { id, created_at, updated_at, ...rest } = row; return { $id: id, $createdAt: created_at, $updatedAt: updated_at, ...rest } as T; };

interface QueryBuilder {
  eq: (field: string, value: unknown) => QueryBuilder;
  order: (field: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (value: number) => QueryBuilder;
  gt: (field: string, value: unknown) => QueryBuilder;
}
interface ListResult { data: Record<string, unknown>[] | null; error: Error | null; count: number | null }
const mapField = (field: string) => ({ '$id': 'id', '$createdAt': 'created_at', '$updatedAt': 'updated_at' }[field] ?? field);
function applyQueries(query: QueryBuilder, queries: QuerySpec[] = []): QueryBuilder {
  let result = query;
  for (const item of queries) {
    if (item.kind === 'eq') result = result.eq(mapField(item.field!), item.value);
    if (item.kind === 'order') result = result.order(mapField(item.field!), { ascending: item.ascending! });
    if (item.kind === 'limit') result = result.limit(item.value as number);
    if (item.kind === 'cursor') result = result.gt('id', item.value);
  }
  return result;
}

export const databases = {
  async listDocuments<T = Record<string, unknown>>(_db: string, table: string, queries: QuerySpec[] = []) { const request = applyQueries(supabase.from(table).select('*', { count: 'exact' }) as unknown as QueryBuilder, queries); const { data, error, count } = await (request as unknown as Promise<ListResult>); if (error) throw error; return { documents: (data ?? []).map((row: Record<string, unknown>) => fromRow<T>(row)), total: count ?? data?.length ?? 0 }; },
  async getDocument<T = Record<string, unknown>>(_db: string, table: string, id: string) { const { data, error } = await supabase.from(table).select('*').eq('id', id).single(); if (error) throw error; return fromRow<T>(data); },
  async createDocument<T = Record<string, unknown>>(_db: string, table: string, id: string, data: Record<string, unknown>, ...args: unknown[]) { void args; const { data: row, error } = await supabase.from(table).insert({ id, ...toRow(data) }).select().single(); if (error) throw error; return fromRow<T>(row); },
  async updateDocument<T = Record<string, unknown>>(_db: string, table: string, id: string, data: Record<string, unknown>, ...args: unknown[]) { void args; const { data: row, error } = await supabase.from(table).update(toRow(data)).eq('id', id).select().single(); if (error) throw error; return fromRow<T>(row); },
  async deleteDocument(_db: string, table: string, id: string, ...args: unknown[]) { void args; const { error } = await supabase.from(table).delete().eq('id', id); if (error) throw error; },
  async createTransaction() { return { $id: crypto.randomUUID() }; },
  async updateTransaction(id: string, commit: boolean, rollback = false) { void id; void commit; void rollback; },
};
export const functions = { async createExecution(name: string, body: string, ...args: unknown[]) { void args; const { data, error } = await supabase.functions.invoke(name, { body: JSON.parse(body) }); if (error) throw error; return data; } };
export async function fetchAllDocuments<T>(collectionId: string, queries: QuerySpec[] = []): Promise<T[]> { const { documents } = await databases.listDocuments<T>(DB_ID, collectionId, queries); return documents; }
