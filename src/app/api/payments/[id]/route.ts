import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action; // 'APPROVE' | 'REJECT'
    const reason = body.reason || '';

    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      return NextResponse.json({ error: 'Acción inválida. Se requiere APPROVE o REJECT.' }, { status: 400 });
    }

    // 1. Obtener detalles del pago
    const { data: payment, error: fetchErr } = await supabaseAdmin
      .from('manual_payments')
      .select('*, workspace:workspaces(name), product:products(name), plan:plans(name)')
      .eq('id', id)
      .single();

    if (fetchErr || !payment) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // 2. Actualizar estado en Supabase
    const { error: updateErr } = await supabaseAdmin
      .from('manual_payments')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
      .eq('id', id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3. Notificar a Telegram la resolución del pago/demo
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (botToken && adminChatId) {
      const isApproved = newStatus === 'APPROVED';
      const icon = isApproved ? '✅' : '❌';
      const title = isApproved ? 'PAGO / DEMO APROBADO EXITOSAMENTE' : 'PAGO RECHAZADO';
      const clinic = payment.workspace?.name || 'Clínica';
      const product = payment.product?.name || 'Axioma App';
      const plan = payment.plan?.name || 'Plan';
      const amountStr = payment.amount === 0 ? 'ACCESO DEMO' : `$${(payment.amount / 100).toFixed(2)} ${payment.currency}`;

      const text = `${icon} *${title}*\n\n` +
                   `*Clínica / Negocio:* ${clinic}\n` +
                   `*Producto:* ${product} (${plan})\n` +
                   `*Monto:* \`${amountStr}\`\n` +
                   `*Comprobante:* \`${payment.reference}\`\n` +
                   `*Fecha Revisión:* ${new Date().toLocaleString('es-ES')}\n` +
                   (reason ? `*Motivo Rechazo:* ${reason}\n` : '');

      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text,
          parse_mode: 'Markdown',
        }),
      }).catch((e) => console.warn('[Telegram Alert] Falló notificación de aprobación:', e));
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err: any) {
    console.error('[Console Payments Action] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
