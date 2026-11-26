import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!botToken || !adminChatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_ADMIN_CHAT_ID no configurados' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const isTest = searchParams.get('test') === 'true';

  const today = new Date();
  const dayOfMonth = today.getDate();
  const monthName = today.toLocaleString('es-ES', { month: 'long' });
  const year = today.getFullYear();

  // Días clave de aviso fiscal (Días 10, 15 y 20 de cada mes o prueba manual)
  const isTaxAlertDay = isTest || dayOfMonth === 10 || dayOfMonth === 15 || dayOfMonth === 20;

  if (!isTaxAlertDay) {
    return NextResponse.json({
      message: `Hoy (${dayOfMonth} de ${monthName}) no es día programado de alerta fiscal. Alertas los días 10, 15 y 20.`
    });
  }

  const daysRemaining = 28 - dayOfMonth;

  const text = `📊 *[AXIOMA TAXES] RECORDATORIO FISCAL & CONTABLE*

🗓️ *Fecha:* ${dayOfMonth} de ${monthName} de ${year}
⚠️ *Estado:* Período de Declaración de Impuestos activo.

📋 *Checklist para la empresa:*
1️⃣ Consolidar facturas emitidas por suscripciones de Axioma.
2️⃣ Revisar retenciones y compras deducibles del mes.
3️⃣ Preparar el formulario de declaración mensual de IVA y retenciones en la fuente.
${daysRemaining > 0 ? `⏳ *Tiempo sugerido:* Quedan aproximadamente ${daysRemaining} días antes del cierre del ciclo fiscal.` : ''}

👉 [🖥️ Ir a la Consola de Administración](https://console.axiomadynamics.com)

_Mensaje automático generado por Axioma Taxes Cron._`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Recordatorio fiscal enviado con éxito a Telegram',
      messageId: data.result?.message_id
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
