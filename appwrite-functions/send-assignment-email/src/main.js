import { Client, Databases, Query } from 'node-appwrite';

/**
 * Función de Appwrite para enviar correos de notificación en lote
 * Se ejecuta manualmente desde el frontend al asignar evaluadores
 */
export default async ({ req, res, log, error }) => {
  // 1. Inicializar cliente de Appwrite
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || process.env.APPWRITE_FUNCTION_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const DB_ID = 'evaluacion_desempeno';

  // 2. Extraer el Payload del evento
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    error(`Error al parsear el payload: ${err.message}`);
    return res.json({ success: false, message: 'Invalid payload format' }, 400);
  }

  // Validar campos requeridos
  if (!payload || !payload.evaluated_id || !payload.evaluator_ids || !payload.cycle_id) {
    log('El payload no contiene los IDs necesarios. Asegúrate de enviar evaluated_id, evaluator_ids y cycle_id.');
    return res.json({ success: false, message: 'Missing IDs in payload' }, 400);
  }

  const { evaluated_id, evaluator_ids, cycle_id } = payload;

  if (!Array.isArray(evaluator_ids) || evaluator_ids.length === 0) {
    return res.json({ success: true, message: 'No evaluators to notify' });
  }

  try {
    // 3. Consultar la base de datos para obtener al Evaluado y el Ciclo
    log(`Consultando datos para Evaluado: ${evaluated_id}, Ciclo: ${cycle_id}`);
    
    const [evaluatedRes, cycleRes, questionsRes, responsesRes, commentsRes] = await Promise.all([
      databases.listDocuments(DB_ID, 'employees', [Query.equal('$id', evaluated_id), Query.limit(1)]),
      databases.listDocuments(DB_ID, 'evaluation_cycles', [Query.equal('$id', cycle_id), Query.limit(1)]),
      databases.listDocuments(DB_ID, 'questions', [Query.limit(5000)]),
      databases.listDocuments(DB_ID, 'responses', [
        Query.equal('cycle_id', cycle_id),
        Query.equal('evaluated_id', evaluated_id),
        Query.limit(5000),
      ]),
      databases.listDocuments(DB_ID, 'evaluation_comments', [
        Query.equal('cycle_id', cycle_id),
        Query.equal('evaluated_id', evaluated_id),
        Query.limit(5000),
      ]),
    ]);

    if (!evaluatedRes.documents.length || !cycleRes.documents.length) {
      error('No se encontró al evaluado o el ciclo en la base de datos.');
      return res.json({ success: false, message: 'Evaluated or Cycle not found' }, 404);
    }

    const evaluated = evaluatedRes.documents[0];
    const cycle = cycleRes.documents[0];

    // Defense in depth: even if a client sends every assignment, only retain
    // evaluators who have not completed every question and both comment fields.
    const requiredQuestionIds = new Set(questionsRes.documents.map((question) => question.$id));
    const uniqueEvaluatorIds = Array.from(new Set(evaluator_ids));
    const pendingEvaluatorIds = uniqueEvaluatorIds.filter((evaluatorId) => {
      const answeredQuestionIds = new Set(
        responsesRes.documents
          .filter((response) => response.evaluator_id === evaluatorId)
          .map((response) => response.question_id)
      );
      const hasAllResponses = requiredQuestionIds.size > 0 &&
        Array.from(requiredQuestionIds).every((questionId) => answeredQuestionIds.has(questionId));
      const hasAllComments = commentsRes.documents.some((comment) =>
        comment.evaluator_id === evaluatorId &&
        (comment.strengths?.trim().length ?? 0) > 0 &&
        (comment.opportunities?.trim().length ?? 0) > 0
      );
      return !hasAllResponses || !hasAllComments;
    });

    const skippedCount = uniqueEvaluatorIds.length - pendingEvaluatorIds.length;
    log(`Recordatorios pendientes: ${pendingEvaluatorIds.length}; evaluaciones completas omitidas: ${skippedCount}`);

    if (pendingEvaluatorIds.length === 0) {
      return res.json({
        success: true,
        message: 'Todos los evaluadores ya completaron. No se enviaron correos.',
        successCount: 0,
        skippedCount,
      });
    }

    // Formatear la fecha límite si existe
    const deadline = cycle.end_date 
      ? new Date(cycle.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'pronto';

    // 4. Preparar variables de Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      error('No se configuró la variable de entorno RESEND_API_KEY');
      return res.json({ success: false, message: 'Config error' }, 500);
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // 5. Iterar sobre la lista de evaluadores
    for (const evaluatorId of pendingEvaluatorIds) {
      log(`Procesando envío para evaluador: ${evaluatorId}`);
      try {
        const evaluatorRes = await databases.listDocuments(DB_ID, 'employees', [Query.equal('$id', evaluatorId), Query.limit(1)]);
        
        if (!evaluatorRes.documents.length) {
          log(`⚠️ Evaluador ${evaluatorId} no encontrado, omitiendo.`);
          failCount++;
          continue;
        }

        const evaluator = evaluatorRes.documents[0];
        const isSelfEvaluation = evaluatorId === evaluated_id;
        
        let subject = '';
        let htmlContent = '';

        if (isSelfEvaluation) {
          subject = `Autoevaluación Requerida: ${cycle.name}`;
          htmlContent = `
            <div style="font-family: Arial, sans-serif; max-w-xl; margin: 0 auto; color: #333;">
              <h2 style="color: #416364;">Requerimiento de Autoevaluación</h2>
              <p>Hola <strong>${evaluator.name.split(' ')[0]}</strong>,</p>
              <p>Has sido incluido(a) en el proceso de Evaluación de Desempeño corporativo de Central de Negocios para el ciclo <strong>${cycle.name}</strong>.</p>
              <p>Como parte de este proceso, es necesario que ingreses al portal para realizar tu <strong>Autoevaluación</strong> a más tardar el <strong>${deadline}</strong>.</p>
              <div style="text-align: center; margin: 40px 0;">
                <a href="https://evaluacion-cn.vercel.app/" style="background-color: #416364; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Ingresar a mi Autoevaluación
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                Este es un correo automático generado por el Sistema de Evaluación de Central de Negocios.
              </p>
            </div>
          `;
        } else {
          subject = `Requerimiento de Evaluación: ${evaluated.name}`;
          htmlContent = `
            <div style="font-family: Arial, sans-serif; max-w-xl; margin: 0 auto; color: #333;">
              <h2 style="color: #416364;">Requerimiento de Evaluación de Desempeño</h2>
              <p>Hola <strong>${evaluator.name.split(' ')[0]}</strong>,</p>
              <p>Has sido seleccionado(a) para participar en el proceso de Evaluación de Desempeño corporativo de Central de Negocios para el ciclo <strong>${cycle.name}</strong>.</p>
              <p>Se te ha asignado la tarea de proporcionar retroalimentación constructiva sobre el desempeño de:</p>
              <div style="background-color: #f8fafc; border-left: 4px solid #416364; padding: 15px; margin: 20px 0;">
                <h3 style="margin: 0; color: #1e293b;">${evaluated.name}</h3>
                <p style="margin: 5px 0 0; color: #64748b; font-size: 14px;">${evaluated.department || 'Colaborador'}</p>
              </div>
              <p>Por favor, completa esta evaluación a más tardar el <strong>${deadline}</strong>.</p>
              <p>Recuerda que tus respuestas son confidenciales y fundamentales para el desarrollo y crecimiento del equipo.</p>
              <div style="text-align: center; margin: 40px 0;">
                <a href="https://evaluacion-cn.vercel.app/" style="background-color: #416364; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Ingresar al Portal de Evaluaciones
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                Este es un correo automático generado por el Sistema de Evaluación de Central de Negocios.
              </p>
            </div>
          `;
        }

        // Ejecutar petición HTTP a Resend
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: fromEmail,
            to: evaluator.email,
            subject: subject,
            html: htmlContent
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          error(`Error de Resend para ${evaluator.email}: ${JSON.stringify(errorData)}`);
          failCount++;
          errors.push(errorData);
        } else {
          const result = await response.json();
          log(`✅ Correo enviado con éxito a ${evaluator.email} (ID: ${result.id})`);
          successCount++;
        }
      } catch (err) {
        error(`Error enviando correo a ${evaluatorId}: ${err.message}`);
        failCount++;
        errors.push(err.message);
      }
    }

    return res.json({ 
      success: true, 
      message: `Proceso finalizado. Éxitos: ${successCount}, Fallos: ${failCount}`,
      successCount,
      failCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    error(`Error general en la base de datos de Appwrite: ${err.message}`);
    return res.json({ success: false, message: err.message }, 500);
  }
};
