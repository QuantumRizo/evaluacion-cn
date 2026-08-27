import { Client, Users, Query } from 'node-appwrite';
import crypto from 'node:crypto';

const source = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
const users = new Users(source);
const targetUrl = process.env.SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function listAppwriteUsers() {
  const result = [];
  let cursor;
  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await users.list(queries);
    result.push(...page.users);
    if (page.users.length < 100) return result;
    cursor = page.users.at(-1).$id;
  }
}

async function admin(path, options = {}) {
  const response = await fetch(`${targetUrl}/auth/v1${path}`, { ...options, headers: { apikey: targetKey, Authorization: `Bearer ${targetKey}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(body?.msg ?? body?.message ?? `HTTP ${response.status}`); error.status = response.status; throw error; }
  return body;
}

const existing = [];
for (let page = 1; ; page += 1) {
  const usersPage = await admin(`/admin/users?page=${page}&per_page=100`);
  existing.push(...(usersPage.users ?? []));
  if ((usersPage.users ?? []).length < 100) break;
}

const byEmail = new Map(existing.map((user) => [user.email.toLowerCase(), user]));
const appwriteUsers = await listAppwriteUsers();
let created = 0;
let linked = 0;
for (const user of appwriteUsers) {
  if (!user.email) continue;
  let target = byEmail.get(user.email.toLowerCase());
  if (!target) {
    target = await admin('/admin/users', { method: 'POST', body: JSON.stringify({ email: user.email, password: crypto.randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { full_name: user.name ?? '' } }) });
    byEmail.set(user.email.toLowerCase(), target);
    created += 1;
  }
  const response = await fetch(`${targetUrl}/rest/v1/employees?auth_user_id=eq.${encodeURIComponent(user.$id)}`, { method: 'PATCH', headers: { apikey: targetKey, Authorization: `Bearer ${targetKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ auth_user_id: target.id }) });
  if (!response.ok) throw new Error(`No se pudo vincular ${user.$id}: ${response.status}`);
  linked += 1;
}
console.log(`usuarios Appwrite encontrados: ${appwriteUsers.length}`);
console.log(`usuarios Supabase creados: ${created}`);
console.log(`perfiles vinculados: ${linked}`);
