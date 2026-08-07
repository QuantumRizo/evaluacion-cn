/**
 * Script para agregar el campo is_active a la colección employees.
 *
 * Uso:
 *   node scripts/add-is-active.js
 *
 * Este script agrega el atributo booleano is_active a la colección de empleados
 * para permitir desactivar/reactivar colaboradores desde el Panel Administrativo.
 */

import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const ENDPOINT   = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('❌ Faltan variables de entorno. Revisa APPWRITE_API_KEY en .env.local');
  process.exit(1);
}

const client = new Client();
client.setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const DB_ID = 'evaluacion_desempeno';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🚀 Agregando campo is_active a la colección employees...');

  try {
    await databases.createBooleanAttribute(
      DB_ID,
      'employees',
      'is_active',
      false,    // required = false
      true,     // default = true (todos los empleados son activos por defecto)
    );
    console.log('  ✓ Atributo is_active (boolean, default: true) creado correctamente.');
  } catch (err) {
    if (err.code === 409) {
      console.log('  ↩ El atributo is_active ya existe, saltando.');
    } else {
      console.error(`  ❌ Error al crear atributo: ${err.message}`);
      process.exit(1);
    }
  }

  await sleep(2000);
  console.log('\n✅ Listo. Ahora puedes usar el botón Desactivar/Reactivar en el Panel Administrativo.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
