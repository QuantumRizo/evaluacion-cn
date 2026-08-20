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

async function createAttribute(collectionId, attr) {
  try {
    switch (attr.type) {
      case 'string':
        await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, attr.required ?? false, attr.default, attr.array ?? false);
        break;
    }
    console.log(`      • ${attr.key} (${attr.type})`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`      • ${attr.key} ya existe, saltando.`);
    } else {
      console.warn(`      ⚠ Error en "${attr.key}": ${err.message}`);
    }
  }
}

async function main() {
  console.log('🚀 Agregando campos strengths y opportunities a final_reports y evaluation_comments...');
  
  // evaluation_comments
  await createAttribute('evaluation_comments', { key: 'strengths', type: 'string', size: 5000, required: false });
  await sleep(1000);
  await createAttribute('evaluation_comments', { key: 'opportunities', type: 'string', size: 5000, required: false });
  await sleep(1000);

  // final_reports
  await createAttribute('final_reports', { key: 'strengths', type: 'string', size: 5000, required: false });
  await sleep(1000);
  await createAttribute('final_reports', { key: 'opportunities', type: 'string', size: 5000, required: false });
  
  console.log('✅ Listo.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
