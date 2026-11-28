import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!botToken || !adminChatId) {
      return NextResponse.json(
        { success: false, error: 'Credenciales de Telegram no configuradas' },
        { status: 500 }
      );
    }

    // Ventana de 15 minutos para cubrir el intervalo de 10 minutos con margen
    const timeWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Consultar eventos de telemetría recientes pendientes de notificación
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, action, module, target_type, summary, metadata, actor_email, created_at')
      .gte('created_at', timeWindow)
      .like('action', 'TELEMETRY_%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Telemetry Digest] Error al consultar audit_logs:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Filtrar los que no hayan sido notificados previamente
    const pendingLogs = (logs || []).filter((log) => {
      const meta = log.metadata as Record<string, any> | null;
      return !meta || meta.notified !== true;
    });

    if (pendingLogs.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'Sin incidencias en la última ventana de tiempo.',
      });
    }

    // Agrupar por categoría
    const categories: Record<string, { count: number; samples: string[] }> = {};
    const affectedUsers = new Set<string>();

    for (const log of pendingLogs) {
      if (log.actor_email) affectedUsers.add(log.actor_email);
      const cat = (log.target_type || 'general').toUpperCase();
      if (!categories[cat]) {
        categories[cat] = { count: 0, samples: [] };
      }
      categories[cat].count += 1;
      if (categories[cat].samples.length < 3) {
        const meta = log.metadata as Record<string, any> | null;
        const msg = meta?.message || log.summary || 'Error reportado';
        const urlStr = meta?.url ? ` (${new URL(meta.url).pathname})` : '';
        categories[cat].samples.push(`${msg}${urlStr}`);
      }
    }

    const consoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL || 'https://console.axiomadynamics.com';
    const dateStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    let text = `⏱️ *[AXIOMA CONSOLE] REPORTE DE INCIDENCIAS (10 MIN)*\n\n`;
    text += `🕒 *Ventana:* Corte a las ${dateStr}\n`;
    text += `📊 *Total Eventos:* \`${pendingLogs.length}\` incidencias capturadas\n`;
    text += `👥 *Usuarios Afectados:* \`${affectedUsers.size > 0 ? affectedUsers.size : 'Anónimos / Visitantes'}\`\n\n`;

    text += `📋 *Resumen por Categoría:*\n`;
    for (const [cat, data] of Object.entries(categories)) {
      text += `• *${cat}* (${data.count} eventos):\n`;
      for (const sample of data.samples) {
        const cleanSample = sample.length > 90 ? sample.slice(0, 90) + '...' : sample;
        text += `   - \`${cleanSample.replace(/`/g, "'")}\`\n`;
      }
    }

    text += `\n👉 [🖥️ Ver Detalle Completo en Axioma Console](${consoleUrl})\n`;

    // Despachar a Telegram
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

    // Marcar como notificados los logs procesados
    const processedIds = pendingLogs.map((l) => l.id);
    for (const id of processedIds) {
      const log = pendingLogs.find((l) => l.id === id);
      const currentMeta = (log?.metadata as Record<string, any>) || {};
      await supabaseAdmin
        .from('audit_logs')
        .update({
          metadata: {
            ...currentMeta,
            notified: true,
            notifiedAt: new Date().toISOString(),
          },
        })
        .eq('id', id);
    }

    return NextResponse.json({
      success: true,
      reportedCount: pendingLogs.length,
      telegramDelivered: telegramRes.ok,
      messageId: telegramData.result?.message_id,
    });
  } catch (err: any) {
    console.error('[Telemetry Digest] Error no controlado:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
