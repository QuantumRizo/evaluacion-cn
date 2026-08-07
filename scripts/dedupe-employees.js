/**
 * Script para eliminar empleados duplicados de la colección employees.
 * Mantiene el documento más reciente (mayor $createdAt) para cada email.
 *
 * Uso: node scripts/dedupe-employees.js
 */

import { Client, Databases, Query, ID } from 'node-appwrite';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = 'evaluacion_desempeno';

async function dedupeEmployees() {
  console.log('🔍 Buscando empleados duplicados...\n');

  // Fetch all employees
  let all = [];
  let cursor;
  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, 'employees', queries);
    all.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }

  console.log(`📋 Total de registros en la colección: ${all.length}\n`);

  // Group by email
  const byEmail = {};
  for (const emp of all) {
    const email = (emp.email || '').toLowerCase().trim();
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(emp);
  }

  // Find duplicates
  let deleted = 0;
  for (const [email, docs] of Object.entries(byEmail)) {
    if (docs.length <= 1) continue;

    // Sort by $createdAt descending — keep the most recent one
    docs.sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));
    const [keep, ...toDelete] = docs;

    console.log(`⚠️  Duplicado: ${email} (${docs.length} registros)`);
    console.log(`   ✓ Mantener:  ${keep.$id} (${keep.name}) — creado ${keep.$createdAt}`);

    for (const dup of toDelete) {
      console.log(`   ✗ Eliminar: ${dup.$id} (${dup.name}) — creado ${dup.$createdAt}`);
      await databases.deleteDocument(DB_ID, 'employees', dup.$id);
      deleted++;
    }
    console.log('');
  }

  if (deleted === 0) {
    console.log('✅ No se encontraron duplicados.');
  } else {
    console.log(`✅ Listo. Se eliminaron ${deleted} registros duplicados.`);
  }
}

dedupeEmployees().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
