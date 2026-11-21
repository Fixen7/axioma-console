import { NextRequest, NextResponse } from 'next/server';

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
    const body: TelemetryPayload = await request.json();

    if (!body || !body.title || !body.message) {
      return NextResponse.json(
        { error: 'Parámetros inválidos. Se requiere title y message.' },
        { status: 400 }
      );
    }

    // Persistir el evento de telemetría en audit_logs de Supabase
    try {
      const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
      await supabaseAdmin.from('audit_logs').insert({
        workspace_id: body.workspaceId || null,
        actor_email: body.userEmail || null,
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
        }
      });
    } catch (dbErr) {
      console.warn('[Console Telemetry] Error al guardar en audit_logs:', dbErr);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '9028028768:AAHbISh0m3W_Xs4vlRnK-sOxZvWoJEgx6h8';
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '6022360968';

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
