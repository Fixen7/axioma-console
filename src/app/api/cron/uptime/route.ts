import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface HealthCheckTarget {
  name: string;
  url?: string;
  type: 'http' | 'database';
}

const TARGETS: HealthCheckTarget[] = [
  { name: 'Axioma Vet', url: 'https://vet.axiomadynamics.com', type: 'http' },
  { name: 'Axioma Core', url: 'https://core.axiomadynamics.com', type: 'http' },
  { name: 'Axioma Landing Page', url: 'https://axiomadynamics.com', type: 'http' },
  { name: 'PostgreSQL Production DB', type: 'database' },
];

async function dispatchTelegramAlert(target: string, errorMsg: string, details?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !adminChatId) return;

  const dateStr = new Date().toLocaleString('es-ES');
  let text = `🚨 *[CRITICAL UPTIME] ALERTA DE SERVICIO EN PRODUCCIÓN*\n\n`;
  text += `*Servicio Afectado:* \`${target}\`\n`;
  text += `*Detalle:* ${errorMsg}\n`;
  text += `*Fecha/Hora:* ${dateStr}\n\n`;

  text += `📋 *REPORTE PARA INGENIERÍA:*\n`;
  text += `\`\`\`text\n`;
  text += `INCIDENTE DE INFRAESTRUCTURA AXIOMA:\n`;
  text += `- Servicio: ${target}\n`;
  text += `- Causa: ${errorMsg}\n`;
  text += `- Detalles: ${details || 'Sin respuesta satisfactoria'}\n`;
  text += `- Acción requerida: Revisar estado en Vercel/Hostinger/Supabase.\n`;
  text += `\`\`\``;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (e) {
    console.error('[Uptime Cron] Error despachando a Telegram:', e);
  }
}

export async function GET() {
  const results: Record<string, { status: 'healthy' | 'down'; latencyMs: number; error?: string }> = {};
  const failures: string[] = [];

  for (const target of TARGETS) {
    const start = Date.now();
    try {
      if (target.type === 'http' && target.url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

        const res = await fetch(target.url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'Axioma-Uptime-Monitor/1.0' },
        });
        clearTimeout(timeoutId);

        const latency = Date.now() - start;

        // Si responde 200, 307 (redirect de login) o 308 es saludable
        if (res.ok || res.status === 307 || res.status === 308) {
          results[target.name] = { status: 'healthy', latencyMs: latency };
        } else {
          const err = `HTTP ${res.status} ${res.statusText}`;
          results[target.name] = { status: 'down', latencyMs: latency, error: err };
          failures.push(`${target.name} (${err})`);
          await dispatchTelegramAlert(target.name, err, `URL: ${target.url}`);
        }
      } else if (target.type === 'database') {
        const dbRes = await sql`SELECT 1 as live`;
        const latency = Date.now() - start;

        if (dbRes && dbRes[0]?.live === 1) {
          results[target.name] = { status: 'healthy', latencyMs: latency };
        } else {
          const err = 'Consulta de verificación devolvió resultado inesperado';
          results[target.name] = { status: 'down', latencyMs: latency, error: err };
          failures.push(`${target.name} (${err})`);
          await dispatchTelegramAlert(target.name, err);
        }
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout ? 'Timeout (> 7 segundos sin respuesta)' : (err.message || 'Error de conexión');
      results[target.name] = { status: 'down', latencyMs: latency, error: msg };
      failures.push(`${target.name} (${msg})`);
      await dispatchTelegramAlert(target.name, msg);
    }
  }

  const allHealthy = failures.length === 0;

  return NextResponse.json(
    {
      status: allHealthy ? 'ALL_SYSTEMS_OPERATIONAL' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      failures,
      metrics: results,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
