/**
 * Script de inicialización de la base de datos en Appwrite Cloud.
 *
 * Uso:
 *   1. Llena APPWRITE_API_KEY en .env.local
 *   2. Ejecuta: npm run init-db
 *
 * Crea la base de datos y las colecciones con sus atributos,
 * luego siembra las 28 preguntas predefinidas.
 *
 * NOTA: Si ya corriste el script antes y el esquema cambió,
 * elimina manualmente las colecciones en la consola de Appwrite
 * antes de volver a ejecutar.
 */

import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
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

// ─── Permisos base ────────────────────────────────────────────────
const BASE_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

// ─── Schema de colecciones ────────────────────────────────────────
const COLLECTIONS = [
  {
    id: 'employees',
    name: 'Empleados',
    attributes: [
      { key: 'name',         type: 'string',  size: 255,  required: true  },
      { key: 'email',        type: 'email',               required: true  },
      { key: 'department',   type: 'string',  size: 255,  required: false },
      { key: 'position',     type: 'string',  size: 255,  required: false },
      { key: 'role',         type: 'enum',    elements: ['admin', 'employee'], required: true, default: 'employee' },
      { key: 'auth_user_id', type: 'string',  size: 255,  required: false },
    ],
  },
  {
    id: 'evaluation_cycles',
    name: 'Ciclos de Evaluación',
    attributes: [
      { key: 'name',        type: 'string', size: 255,  required: true  },
      { key: 'description', type: 'string', size: 1000, required: false },
      { key: 'status',      type: 'enum',   elements: ['draft', 'active', 'closed'], required: true, default: 'draft' },
      { key: 'start_date',  type: 'datetime',             required: false },
      { key: 'end_date',    type: 'datetime',             required: false },
    ],
  },
  {
    id: 'questions',
    name: 'Preguntas',
    attributes: [
      { key: 'text',        type: 'string', size: 500, required: true  },
      {
        key: 'category',
        type: 'enum',
        elements: [
          'orientacion_resultados',
          'pensamiento_estrategico',
          'calidad_mejora_continua',
          'relaciones_interpersonales',
          'iniciativa',
          'trabajo_equipo',
          'organizacion',
          'comunicacion',
        ],
        required: true,
      },
      { key: 'max_score',   type: 'float',   required: false, min: 0, max: 1, default: 1 },
      { key: 'order',       type: 'integer', required: false, min: 0 },
      { key: 'is_inverted', type: 'boolean', required: false, default: false },
    ],
  },
  {
    id: 'responses',
    name: 'Respuestas',
    attributes: [
      { key: 'cycle_id',        type: 'string', size: 255, required: true  },
      { key: 'question_id',     type: 'string', size: 255, required: true  },
      { key: 'evaluator_id',    type: 'string', size: 255, required: true  },
      { key: 'evaluated_id',    type: 'string', size: 255, required: true  },
      { key: 'score',           type: 'float',  required: true, min: 0, max: 1 },
      { key: 'evaluation_type', type: 'enum',   elements: ['self', 'peer'], required: true },
    ],
  },
  {
    id: 'final_reports',
    name: 'Reportes Finales',
    attributes: [
      { key: 'cycle_id',        type: 'string',  size: 255,  required: true  },
      { key: 'employee_id',     type: 'string',  size: 255,  required: true  },
      { key: 'self_score',      type: 'float',   required: false, min: 0, max: 1 },
      { key: 'collective_score',type: 'float',   required: false, min: 0, max: 1 },
      { key: 'admin_summary',   type: 'string',  size: 5000, required: false },
      { key: 'final_score',     type: 'float',   required: false, min: 0, max: 1 },
      { key: 'is_exported',     type: 'boolean', required: false, default: false },
    ],
  },
  {
    id: 'evaluation_assignments',
    name: 'Asignaciones de Evaluadores',
    attributes: [
      { key: 'cycle_id',     type: 'string', size: 255, required: true },
      { key: 'evaluated_id', type: 'string', size: 255, required: true },
      { key: 'evaluator_id', type: 'string', size: 255, required: true },
    ],
  },
  {
    id: 'evaluation_comments',
    name: 'Comentarios de Evaluacion',
    attributes: [
      { key: 'cycle_id',        type: 'string', size: 255, required: true },
      { key: 'evaluator_id',    type: 'string', size: 255, required: true },
      { key: 'evaluated_id',    type: 'string', size: 255, required: true },
      { key: 'evaluation_type', type: 'enum',   elements: ['self', 'peer'], required: true },
      { key: 'comment',         type: 'string', size: 5000, required: false },
      { key: 'strengths',       type: 'string', size: 5000, required: false },
      { key: 'opportunities',   type: 'string', size: 5000, required: false },
    ],
  },
];

// ─── 28 preguntas predefinidas ────────────────────────────────────
//   is_inverted = true → Casi nunca es lo óptimo (e.g. "Comete errores")
//   El formulario frontend invierte el score antes de guardarlo.
const QUESTIONS = [
  // Orientación a Resultados
  { text: 'Cumple con las tareas que se le encomiendan',          category: 'orientacion_resultados', order: 1,  is_inverted: false },
  { text: 'Termina su trabajo oportunamente',                     category: 'orientacion_resultados', order: 2,  is_inverted: false },
  { text: 'Realiza un volumen adecuado de trabajo',               category: 'orientacion_resultados', order: 3,  is_inverted: false },
  { text: 'Mantiene altos niveles de estándares de desempeño',    category: 'orientacion_resultados', order: 4,  is_inverted: false },

  // Pensamiento Estratégico
  { text: 'Comprende las implicaciones de sus decisiones en el negocio a corto y largo plazo', category: 'pensamiento_estrategico', order: 5,  is_inverted: false },
  { text: 'Determina objetivos y establece prioridades para lograrlos',                        category: 'pensamiento_estrategico', order: 6,  is_inverted: false },
  { text: 'Conserva la calma en situaciones complicadas',                                       category: 'pensamiento_estrategico', order: 7,  is_inverted: false },

  // Calidad y Mejora Continua
  { text: 'Comete errores en su trabajo',                               category: 'calidad_mejora_continua', order: 8,  is_inverted: true  },
  { text: 'Requiere de supervisión frecuente',                          category: 'calidad_mejora_continua', order: 9,  is_inverted: true  },
  { text: 'Tiene flexibilidad y disposición de cambio ante las situaciones', category: 'calidad_mejora_continua', order: 10, is_inverted: false },
  { text: 'Cuenta con los conocimientos técnicos para desempeñar su puesto', category: 'calidad_mejora_continua', order: 11, is_inverted: false },

  // Relaciones Interpersonales
  { text: 'Se muestra respetuoso con sus líderes y con sus compañeros',           category: 'relaciones_interpersonales', order: 12, is_inverted: false },
  { text: 'Brinda una adecuada orientación a sus compañeros si lo necesitan',     category: 'relaciones_interpersonales', order: 13, is_inverted: false },
  { text: 'Evita los conflictos dentro del trabajo',                               category: 'relaciones_interpersonales', order: 14, is_inverted: false },

  // Iniciativa
  { text: 'Muestra nuevas ideas para mejorar los procesos',   category: 'iniciativa', order: 15, is_inverted: false },
  { text: 'Se muestra accesible al cambio',                   category: 'iniciativa', order: 16, is_inverted: false },
  { text: 'Se anticipa a las dificultades',                   category: 'iniciativa', order: 17, is_inverted: false },
  { text: 'Tiene gran capacidad para resolver problemas',     category: 'iniciativa', order: 18, is_inverted: false },

  // Trabajo en Equipo
  { text: 'Muestra aptitud para integrarse al equipo',                      category: 'trabajo_equipo', order: 19, is_inverted: false },
  { text: 'Se desempeña como un miembro activo del equipo',                 category: 'trabajo_equipo', order: 20, is_inverted: false },
  { text: 'Muestra disponibilidad para apoyar en las tareas solicitadas',   category: 'trabajo_equipo', order: 21, is_inverted: false },

  // Organización
  { text: 'Es capaz de establecer prioridades en sus tareas laborales',                         category: 'organizacion', order: 22, is_inverted: false },
  { text: 'Completa de manera efectiva en tiempo y forma los proyectos asignados',              category: 'organizacion', order: 23, is_inverted: false },
  { text: 'Mantiene el orden y limpieza en su área de trabajo',                                 category: 'organizacion', order: 24, is_inverted: false },

  // Comunicación
  { text: 'Mantiene una comunicación asertiva con sus líderes y compañeros', category: 'comunicacion', order: 25, is_inverted: false },
  { text: 'Se comunica de manera escrita con claridad',                      category: 'comunicacion', order: 26, is_inverted: false },
  { text: 'Comparte información de manera efectiva y asertiva',              category: 'comunicacion', order: 27, is_inverted: false },
  { text: 'Evita la propagación de rumores o información falsa',             category: 'comunicacion', order: 28, is_inverted: false },
];

// ─── Helpers ──────────────────────────────────────────────────────

async function ensureDatabase() {
  try {
    await databases.get(DB_ID);
    console.log(`  ✓ Base de datos "${DB_ID}" ya existe.`);
  } catch {
    await databases.create(DB_ID, 'Evaluación de Desempeño');
    console.log(`  ✓ Base de datos "${DB_ID}" creada.`);
  }
}

async function createAttribute(collectionId, attr) {
  try {
    switch (attr.type) {
      case 'string':
        await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, attr.required ?? false, attr.default, attr.array ?? false);
        break;
      case 'email':
        await databases.createEmailAttribute(DB_ID, collectionId, attr.key, attr.required ?? false, attr.default);
        break;
      case 'enum':
        await databases.createEnumAttribute(DB_ID, collectionId, attr.key, attr.elements, attr.required ?? false, attr.default);
        break;
      case 'float':
        await databases.createFloatAttribute(DB_ID, collectionId, attr.key, attr.required ?? false, attr.min, attr.max, attr.default);
        break;
      case 'integer':
        await databases.createIntegerAttribute(DB_ID, collectionId, attr.key, attr.required ?? false, attr.min, attr.max, attr.default);
        break;
      case 'boolean':
        await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, attr.required ?? false, attr.default);
        break;
      case 'datetime':
        await databases.createDatetimeAttribute(DB_ID, collectionId, attr.key, attr.required ?? false, attr.default);
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

async function ensureCollection(col) {
  let exists = false;
  try {
    await databases.getCollection(DB_ID, col.id);
    exists = true;
    console.log(`\n  ↩ Colección "${col.id}" ya existe, verificando atributos...`);
  } catch {
    await databases.createCollection(DB_ID, col.id, col.name, BASE_PERMISSIONS);
    console.log(`\n  + Colección "${col.id}" creada.`);
  }

  if (!exists) {
    console.log(`    Atributos:`);
    for (const attr of col.attributes) {
      await createAttribute(col.id, attr);
      await sleep(300);
    }
  }
}

async function seedQuestions() {
  console.log('\n  Esperando a que los atributos estén disponibles...');
  await sleep(5000); // Appwrite necesita procesar los atributos antes de insertar docs

  const existing = await databases.listDocuments(DB_ID, 'questions');
  if (existing.total > 0) {
    console.log(`  ↩ Ya existen ${existing.total} preguntas. Saltando seed.`);
    return;
  }

  console.log(`  Insertando ${QUESTIONS.length} preguntas...`);
  for (const q of QUESTIONS) {
    try {
      await databases.createDocument(DB_ID, 'questions', ID.unique(), {
        text:        q.text,
        category:    q.category,
        max_score:   1.0,
        order:       q.order,
        is_inverted: q.is_inverted,
      });
      process.stdout.write(`    [${q.order.toString().padStart(2, '0')}] ${q.text.substring(0, 55)}\n`);
      await sleep(150); // Evitar rate limiting
    } catch (err) {
      console.warn(`    ⚠ Error al insertar pregunta ${q.order}: ${err.message}`);
    }
  }
}

// ─── Ejecución ────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Inicializando Appwrite Cloud...\n');
  console.log('Base de datos:');
  await ensureDatabase();

  console.log('\nColecciones:');
  for (const col of COLLECTIONS) {
    await ensureCollection(col);
  }

  console.log('\nSeed de preguntas:');
  await seedQuestions();

  console.log('\n✅ Inicialización completada.\n');
  console.log('Próximos pasos:');
  console.log('  1. Crea los usuarios en la consola de Appwrite (Authentication → Users).');
  console.log('  2. Crea el documento correspondiente en la colección "employees"');
  console.log('     con auth_user_id = UID del usuario de Appwrite.');
  console.log('  3. Desde /admin, crea y activa un ciclo de evaluación.');
  console.log('  4. Comparte el link /login con tu equipo.');
}

main().catch((err) => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
