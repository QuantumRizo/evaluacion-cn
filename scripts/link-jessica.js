import { Client, Users, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const users = new Users(client);
const databases = new Databases(client);
const DB_ID = 'evaluacion_desempeno';

async function linkJessica() {
  try {
    const email = 'rh@centrales.com.mx';
    const name = 'Jessica Troncoso';
    const password = 'Password123!';
    
    // 1. Create Auth user
    let authUserId;
    try {
      const existingUsers = await users.list([Query.equal('email', email)]);
      if (existingUsers.users.length > 0) {
         authUserId = existingUsers.users[0].$id;
         console.log(`✅ El usuario de Auth ya existía con ID: ${authUserId}`);
      } else {
         const newAuthUser = await users.create('unique()', email, undefined, password, name);
         authUserId = newAuthUser.$id;
         console.log(`✅ Usuario de Auth creado correctamente con ID: ${authUserId}`);
      }
    } catch (err) {
      console.error("❌ Error al crear el usuario en Auth:", err);
      process.exit(1);
    }

    // 2. Find existing employee record
    const empRes = await databases.listDocuments(DB_ID, 'employees', [
      Query.equal('email', email)
    ]);

    if (empRes.documents.length === 0) {
      console.log('❌ No se encontró el registro del empleado en la base de datos.');
      process.exit(1);
    }

    const employeeId = empRes.documents[0].$id;
    console.log(`✅ Registro de empleado encontrado en BD con ID: ${employeeId}`);

    // 3. Link them
    await databases.updateDocument(DB_ID, 'employees', employeeId, {
      auth_user_id: authUserId
    });
    console.log(`🎉 ¡Éxito! El registro del empleado ha sido vinculado con el usuario de Auth.`);

  } catch (err) {
    console.error(err);
  }
}

linkJessica();
