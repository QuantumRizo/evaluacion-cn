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

async function migrateCycles() {
  console.log('🔄 Buscando ciclos antiguos sin evaluado...');
  try {
    const cyclesRes = await databases.listDocuments(DB_ID, 'evaluation_cycles');
    let updated = 0;

    for (const cycle of cyclesRes.documents) {
      if (cycle.evaluated_employee_id) {
        console.log(`  - Ciclo "${cycle.name}" ya tiene evaluado.`);
        continue;
      }

      // Buscar asignaciones para este ciclo para deducir quién es el evaluado
      const assignments = await databases.listDocuments(DB_ID, 'evaluation_assignments', [
        Query.equal('cycle_id', cycle.$id)
      ]);

      if (assignments.documents.length > 0) {
        // Asumimos que todas las asignaciones del ciclo apuntan a la misma persona evaluada
        const evaluatedId = assignments.documents[0].evaluated_id;
        
        await databases.updateDocument(DB_ID, 'evaluation_cycles', cycle.$id, {
          evaluated_employee_id: evaluatedId
        });
        console.log(`  ✓ Ciclo "${cycle.name}" reparado (se le asignó el evaluado).`);
        updated++;
      } else {
        console.log(`  - Ciclo "${cycle.name}" está vacío (sin evaluadores), no se pudo deducir.`);
      }
    }
    
    console.log(`\n✅ Listo. Se repararon ${updated} ciclos antiguos.`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

migrateCycles();
