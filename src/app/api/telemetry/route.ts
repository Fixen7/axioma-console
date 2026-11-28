import { NextRequest, NextResponse } from 'next/server';
import { sanitizeString, sanitizeObject } from '@/lib/sanitizer';

interface TelemetryPayload {
  appId?: string;
  environment?: string;
  category?: 'database' | 'auth' | 'payments' | 'ui' | 'network' | 'build' | 'general' | 'user_report';
  severity?: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  code?: string | number;
  table?: string;
  operation?: string;
  url?: string;
  workspaceId?: string;
  userId?: string;
  userEmail?: string;
  context?: Record<string, unknown>;
  errorStack?: string;
  timestamp?: string;
  immediate?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  database: '🗄️ BASE DE DATOS / SUPABASE',
  auth: '🔐 AUTENTICACIÓN / SSO',
  payments: '💳 PASARELA DE PAGOS',
  ui: '🖥️ FRONTEND / CLIENTE',
  network: '🌐 CONEXIÓN / RED',
  build: '📦 COMPILACIÓN / VERCEL',
  general: '⚙️ SISTEMA GENERAL',
  user_report: '🐞 REPORTE DE USUARIO',
};

const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔥 [CRITICAL]',
  warning: '⚠️ [WARNING]',
  info: 'ℹ️ [INFO]',
};

function formatTelegramAlert(payload: TelemetryPayload): string {
  const severity = payload.severity || 'critical';
  const category = payload.category || 'general';
  const icon = SEVERITY_ICONS[severity] || '📢';
  const catLabel = CATEGORY_ICONS[category] || category.toUpperCase();
  const env = (payload.environment || process.env.NODE_ENV || 'production').toUpperCase();
  const app = (payload.appId || 'axioma-app').toLowerCase();
  const dateStr = payload.timestamp || new Date().toISOString();

  let text = `${icon} *${app.toUpperCase()}* (${env})\n\n`;
  text += `*Categoría:* ${catLabel}\n`;
  text += `*Evento:* ${payload.title}\n`;
  text += `*Detalle:* \`${payload.message.replace(/`/g, "'")}\`\n`;

  if (payload.code) {
    text += `*Código de Error:* \`${payload.code}\`\n`;
  }
  if (payload.table) {
    text += `*Tabla / Entidad:* \`${payload.table}\`\n`;
  }
  if (payload.operation) {
    text += `*Operación:* \`${payload.operation}\`\n`;
  }
  if (payload.workspaceId) {
    text += `*Workspace:* \`${payload.workspaceId}\`\n`;
  }
  if (payload.userEmail || payload.userId) {
    text += `*Usuario:* ${payload.userEmail || payload.userId}\n`;
  }
  if (payload.url) {
    text += `*URL:* \`${payload.url}\`\n`;
  }

  if (payload.context && Object.keys(payload.context).length > 0) {
    const rawCtx = JSON.stringify(payload.context, null, 2);
    const trimmedCtx = rawCtx.length > 400 ? rawCtx.slice(0, 400) + '...' : rawCtx;
    text += `*Contexto:* \`\`\`json\n${trimmedCtx}\n\`\`\`\n`;
  }

  if (payload.errorStack) {
    const trimmedStack = payload.errorStack.slice(0, 350).replace(/`/g, "'");
    text += `*Stack Trace:* \`\`\`\n${trimmedStack}\n\`\`\`\n`;
  }

  text += `*Fecha:* ${dateStr}\n\n`;

  // Bloque para copiar directo a Antigravity
  text += `📋 *COPIAR PARA ANTIGRAVITY:*\n`;
  text += `\`\`\`text\n`;
  text += `REPORTE TÉCNICO AXIOMA:\n`;
  text += `- App: ${app}\n`;
  text += `- Categoría: ${category}\n`;
  if (payload.code) text += `- Código: ${payload.code}\n`;
  if (payload.table) text += `- Tabla: ${payload.table}\n`;
  if (payload.operation) text += `- Operación: ${payload.operation}\n`;
  text += `- Error: ${payload.message}\n`;
  text += `- Contexto: Incidente capturado en ${env}.\n`;
  text += `- Solución esperada: Diagnosticar causa raíz y proveer parche/migración inmediata.\n`;
  text += `\`\`\``;

  return text;
}

export async function GET() {
  try {
    const { getConsoleSession } = await import('@/lib/auth');
    const session = await getConsoleSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, logs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody: TelemetryPayload = await request.json();

    if (!rawBody || !rawBody.title || !rawBody.message) {
      return NextResponse.json(
        { error: 'Parámetros inválidos. Se requiere title y message.' },
        { status: 400 }
      );
    }

    // Saneamiento de seguridad de todos los campos para evitar fugas de datos
    const body: TelemetryPayload = {
      appId: sanitizeString(rawBody.appId || 'axioma-app'),
      environment: sanitizeString(rawBody.environment || process.env.NODE_ENV || 'production'),
      category: rawBody.category || 'general',
      severity: rawBody.severity || 'info',
      title: sanitizeString(rawBody.title),
      message: sanitizeString(rawBody.message),
      code: rawBody.code ? sanitizeString(String(rawBody.code)) : undefined,
      table: rawBody.table ? sanitizeString(rawBody.table) : undefined,
      operation: rawBody.operation ? sanitizeString(rawBody.operation) : undefined,
      url: rawBody.url ? sanitizeString(rawBody.url) : undefined,
      workspaceId: rawBody.workspaceId ? sanitizeString(rawBody.workspaceId) : undefined,
      userId: rawBody.userId ? sanitizeString(rawBody.userId) : undefined,
      userEmail: rawBody.userEmail ? sanitizeString(rawBody.userEmail) : undefined,
      context: rawBody.context ? sanitizeObject(rawBody.context) : undefined,
      errorStack: rawBody.errorStack ? sanitizeString(rawBody.errorStack) : undefined,
      timestamp: rawBody.timestamp || new Date().toISOString(),
      immediate: rawBody.immediate,
    };

    // Política de despacho inmediato vs reporte consolidado (Digest 10 min):
    // - Errores de cliente (UI, reportes de usuario, red del cliente) se agrupan cada 10 min.
    // - Errores explícitamente marcados con immediate === false se agrupan.
    // - Errores críticos de infraestructura o pagos sin immediate: false se despachan de inmediato.
    const isClientTelemetry = body.category === 'ui' || body.category === 'network' || body.category === 'user_report';
    const shouldDispatchImmediate = body.immediate === true || (body.immediate !== false && !isClientTelemetry && body.severity === 'critical');

    let dbError: string | null = null;
    // Persistir el evento de telemetría saneado en audit_logs de Supabase
    try {
      const { supabaseAdmin } = await import('@/lib/supabaseAdmin');

      // Si no viene workspaceId (ej. errores de login o visitantes), obtener un workspace válido para satisfacer la restricción NOT NULL de la base de datos
      let targetWorkspaceId = body.workspaceId || null;
      if (!targetWorkspaceId) {
        const { data: defaultWs } = await supabaseAdmin.from('workspaces').select('id').limit(1).maybeSingle();
        targetWorkspaceId = defaultWs?.id || null;
      }

      // Si no viene userId, obtener un usuario válido para satisfacer la restricción NOT NULL de la base de datos
      let targetUserId = body.userId || null;
      if (!targetUserId) {
        const { data: defaultUser } = await supabaseAdmin.from('users').select('id').limit(1).maybeSingle();
        targetUserId = defaultUser?.id || null;
      }

      const insRes = await supabaseAdmin.from('audit_logs').insert({
        workspace_id: targetWorkspaceId,
        actor_user_id: targetUserId,
        actor_email: body.userEmail || 'telemetry@axiomadynamics.com',
        actor_name: body.userEmail || 'Sistema Telemetría',
        action: `TELEMETRY_${(body.severity || 'INFO').toUpperCase()}`,
        module: body.appId || 'system',
        target_type: body.category || 'general',
        target_id: body.code ? String(body.code) : null,
        summary: `${body.title}: ${body.message}`,
        metadata: {
          severity: body.severity || 'info',
          category: body.category || 'general',
          code: body.code,
          table: body.table,
          operation: body.operation,
          url: body.url,
          context: body.context,
          errorStack: body.errorStack,
          notified: shouldDispatchImmediate,
        }
      });
      if (insRes.error) {
        dbError = insRes.error.message;
        console.error('[Console Telemetry] Error insertando en audit_logs:', insRes.error);
      }
    } catch (dbErr: any) {
      dbError = dbErr?.message || String(dbErr);
      console.warn('[Console Telemetry] Error al guardar en audit_logs:', dbErr);
    }

    // Si está configurado para consolidarse cada 10 minutos mediante cron:
    if (!shouldDispatchImmediate) {
      return NextResponse.json({
        success: true,
        queuedForDigest: true,
        dbError,
        message: 'Evento registrado y protegido. Se incluirá en el reporte consolidado de 10 minutos.',
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!botToken || !adminChatId) {
      console.warn('[Console Telemetry] TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID no configurados. Se omite envío a Telegram.');
      return NextResponse.json({
        success: true,
        message: 'Telemetry guardado en audit_logs (alerta Telegram omitida por falta de credenciales)',
      });
    }

    const text = formatTelegramAlert(body);

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const telegramData = await telegramRes.json().catch(() => ({}));

    if (!telegramRes.ok) {
      console.error('[Console Telemetry] Falló envío a Telegram:', telegramData);
      return NextResponse.json(
        { success: false, error: 'Telegram dispatch failed', details: telegramData },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: telegramData.result?.message_id,
    });
  } catch (error) {
    console.error('[Console Telemetry] Error no controlado:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Soporte para CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
