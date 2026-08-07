/**
 * Agrega el campo evaluated_employee_id a la colección evaluation_cycles.
 * Uso: node scripts/add-evaluated-employee-id.js
 */
import { Client, Databases } from 'node-appwrite';
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

async function main() {
  console.log('🚀 Agregando campo evaluated_employee_id a evaluation_cycles...');
  try {
    await databases.createStringAttribute(DB_ID, 'evaluation_cycles', 'evaluated_employee_id', 255, false);
    console.log('  ✓ evaluated_employee_id (string) creado correctamente.');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ↩ El atributo ya existe, saltando.');
    } else {
      console.error(`  ❌ Error: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('\n✅ Listo.');
}

main().catch(err => { console.error(err); process.exit(1); });
