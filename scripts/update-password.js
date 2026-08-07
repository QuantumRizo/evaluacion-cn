import { Client, Users } from 'node-appwrite';
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

async function changePassword() {
  try {
    const authUserId = '6a75d396a064825eb713'; // Jessica's Auth ID from previous step
    await users.updatePassword(authUserId, '12345678');
    console.log(`✅ Contraseña actualizada correctamente a '12345678'.`);
  } catch (err) {
    console.error("❌ Error al cambiar la contraseña:", err);
  }
}

changePassword();
