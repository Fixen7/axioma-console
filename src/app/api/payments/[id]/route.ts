import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
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

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    let payment: any = null;

    // 1. Intentar con SQL directo si existe DATABASE_URL
    if (process.env.DATABASE_URL) {
      try {
        const rows = await sql`
          SELECT 
            mp.*,
            w.name as workspace_name,
            pr.name as product_name,
            pl.name as plan_name
          FROM "manual_payments" mp
          LEFT JOIN "workspaces" w ON mp.workspace_id = w.id
          LEFT JOIN "products" pr ON mp.product_id = pr.id
          LEFT JOIN "plans" pl ON mp.plan_id = pl.id
          WHERE mp.id = ${id}
          LIMIT 1
        `;

        if (rows && rows.length > 0) {
          payment = rows[0];
          await sql`
            UPDATE "manual_payments"
            SET 
              status = ${newStatus},
              reviewed_at = now(),
              rejection_reason = ${reason || null}
            WHERE id = ${id}
          `;

          if (newStatus === 'APPROVED' && payment.workspace_id && payment.product_id) {
            try {
              await sql`
                INSERT INTO "early_access_grants" ("workspace_id", "product_id", "granted_at")
                VALUES (${payment.workspace_id}, ${payment.product_id}, now())
                ON CONFLICT DO NOTHING
              `;
            } catch (grantErr) {
              console.warn('[Grant Error]:', grantErr);
            }
          }
        }
      } catch (sqlErr) {
        console.warn('[Console Payments Action] sql directo falló, usando fallback supabaseAdmin:', sqlErr);
      }
    }

    // Fallback con supabaseAdmin
    if (!payment) {
      const { data: rawPayment, error: fetchErr } = await supabaseAdmin
        .from('manual_payments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !rawPayment) {
        return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
      }

      // Obtener nombres relacionados
      const [wsRes, prRes, plRes] = await Promise.all([
        rawPayment.workspace_id ? supabaseAdmin.from('workspaces').select('name').eq('id', rawPayment.workspace_id).single() : { data: null },
        rawPayment.product_id ? supabaseAdmin.from('products').select('name').eq('id', rawPayment.product_id).single() : { data: null },
        rawPayment.plan_id ? supabaseAdmin.from('plans').select('name').eq('id', rawPayment.plan_id).single() : { data: null },
      ]);

      payment = {
        ...rawPayment,
        workspace_name: wsRes.data?.name || null,
        product_name: prRes.data?.name || null,
        plan_name: plRes.data?.name || null,
      };

      const { error: updateErr } = await supabaseAdmin
        .from('manual_payments')
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq('id', id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      if (newStatus === 'APPROVED' && payment.workspace_id && payment.product_id) {
        try {
          await supabaseAdmin
            .from('early_access_grants')
            .upsert({
              workspace_id: payment.workspace_id,
              product_id: payment.product_id,
              granted_at: new Date().toISOString(),
            });
        } catch (grantErr) {
          console.warn('[Grant Error]:', grantErr);
        }
      }
    }

    // 3. Notificar a Telegram la resolución del pago/demo
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (botToken && adminChatId && payment) {
      const isApproved = newStatus === 'APPROVED';
      const icon = isApproved ? '✅' : '❌';
      const title = isApproved ? 'PAGO / DEMO APROBADO EXITOSAMENTE' : 'PAGO RECHAZADO';
      const clinic = payment.workspace_name || 'Clínica';
      const product = payment.product_name || 'Axioma App';
      const plan = payment.plan_name || 'Plan';
      const amountStr = payment.amount === 0 ? 'ACCESO DEMO' : `$${(payment.amount / 100).toFixed(2)} ${payment.currency || 'USD'}`;

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
