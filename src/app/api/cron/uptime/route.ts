import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

interface HealthCheckTarget {
  name: string;
  url?: string;
  type: 'http' | 'supabase';
}

const TARGETS: HealthCheckTarget[] = [
  { name: 'Axioma Vet', url: 'https://vet.axiomadynamics.com', type: 'http' },
  { name: 'Axioma Core / Portal', url: 'https://app.axiomadynamics.com', type: 'http' },
  { name: 'Supabase Cloud Database', type: 'supabase' },
];

async function dispatchTelegramAlert(target: string, errorMsg: string, details?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !adminChatId) return;

  const dateStr = new Date().toLocaleString('es-ES');
  let text = `🚨 *[CRITICAL UPTIME] CAÍDA DE SERVICIO DETECTADA*\n\n`;
  text += `*Servicio Caído:* \`${target}\`\n`;
  text += `*Detalle:* ${errorMsg}\n`;
  text += `*Fecha/Hora:* ${dateStr}\n\n`;

  text += `📋 *COPIAR PARA ANTIGRAVITY:*\n`;
  text += `\`\`\`text\n`;
  text += `INCIDENTE DE INFRAESTRUCTURA AXIOMA:\n`;
  text += `- Servicio afectado: ${target}\n`;
  text += `- Error: ${errorMsg}\n`;
  text += `- Detalles: ${details || 'Sin respuesta HTTP 200'}\n`;
  text += `- Acción requerida: Verificar estado de Vercel/Hostinger/Supabase de inmediato.\n`;
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

        if (res.ok) {
          results[target.name] = { status: 'healthy', latencyMs: latency };
        } else {
          const err = `HTTP ${res.status} ${res.statusText}`;
          results[target.name] = { status: 'down', latencyMs: latency, error: err };
          failures.push(`${target.name} (${err})`);
          await dispatchTelegramAlert(target.name, err, `URL: ${target.url}`);
        }
      } else if (target.type === 'supabase') {
        const { error } = await supabaseAdmin.from('workspaces').select('id').limit(1);
        const latency = Date.now() - start;

        if (!error) {
          results[target.name] = { status: 'healthy', latencyMs: latency };
        } else {
          results[target.name] = { status: 'down', latencyMs: latency, error: error.message };
          failures.push(`${target.name} (${error.message})`);
          await dispatchTelegramAlert(target.name, `Fallo en consulta Supabase: ${error.message}`, error.hint);
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

  return NextResponse.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checkedAt: new Date().toISOString(),
    failures,
    results,
  }, {
    status: allHealthy ? 200 : 503,
  });
}
