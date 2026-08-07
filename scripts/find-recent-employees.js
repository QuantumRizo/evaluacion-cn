import { Client, Databases, Query } from 'node-appwrite';
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

async function findRecent() {
  try {
    const res = await databases.listDocuments(DB_ID, 'employees', [
      Query.orderDesc('$createdAt'),
      Query.limit(10)
    ]);
    
    console.log("Últimos 10 empleados creados en la base de datos:");
    for (const emp of res.documents) {
      console.log(`- Nombre: ${emp.name} | Email: ${emp.email} | Fecha: ${emp.$createdAt}`);
    }
  } catch (err) {
    console.error(err);
  }
}

findRecent();
