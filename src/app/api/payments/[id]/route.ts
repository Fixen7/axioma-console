import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action; // 'APPROVE' | 'REJECT'
    const reason = (body.reason || '').trim();

    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      return NextResponse.json({ error: 'Acción inválida. Se requiere APPROVE o REJECT.' }, { status: 400 });
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // 1. Obtener registro de manual_payments
    const { data: rawPayment, error: fetchErr } = await supabaseAdmin
      .from('manual_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rawPayment) {
      return NextResponse.json({ error: 'Pago no encontrado en la base de datos' }, { status: 404 });
    }

    // 2. Obtener nombres y detalles relacionados
    const [wsRes, prRes, plRes] = await Promise.all([
      rawPayment.workspace_id ? supabaseAdmin.from('workspaces').select('name').eq('id', rawPayment.workspace_id).single() : { data: null },
      rawPayment.product_id ? supabaseAdmin.from('products').select('id, name, key').eq('id', rawPayment.product_id).single() : { data: null },
      rawPayment.plan_id ? supabaseAdmin.from('plans').select('id, name, key').eq('id', rawPayment.plan_id).single() : { data: null },
    ]);

    const payment = {
      ...rawPayment,
      workspace_name: wsRes.data?.name || 'Clínica',
      product_name: prRes.data?.name || 'Axioma App',
      product_key: prRes.data?.key || '',
      plan_name: plRes.data?.name || 'Plan',
      plan_key: plRes.data?.key || '',
    };

    // 3. Determinar el module_id correspondiente (ej. 'vet' o 'stock')
    let moduleId = 'vet';
    if (payment.plan_id) {
      const { data: pmData } = await supabaseAdmin
        .from('plan_modules')
        .select('module_id')
        .eq('plan_id', payment.plan_id);

      if (pmData && pmData.length > 0 && pmData[0].module_id) {
        moduleId = pmData[0].module_id;
      } else if (payment.product_key?.includes('stock') || payment.product_name?.toLowerCase().includes('stock')) {
        moduleId = 'stock';
      }
    }

    // 3.1 Determinar el intervalo de facturación (mensual o anual) para calcular la fecha de corte
    let billingInterval = 'month';
    if (payment.price_id) {
      try {
        const { data: priceData } = await supabaseAdmin
          .from('prices')
          .select('billing_interval')
          .eq('id', payment.price_id)
          .single();
        if (priceData?.billing_interval) {
          billingInterval = priceData.billing_interval;
        }
      } catch (prcErr) {
        console.warn('[Console Approve] Error obteniendo intervalo de precio:', prcErr);
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Calcular fecha de corte: +1 mes (mensual) o +1 año (anual)
    const nextBillingDate = new Date(now);
    if (billingInterval === 'year') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
    const nextBillingIso = nextBillingDate.toISOString();

    // 4. Actualizar estado en manual_payments
    const { error: updateErr } = await supabaseAdmin
      .from('manual_payments')
      .update({
        status: newStatus,
        reviewed_at: nowIso,
        rejection_reason: newStatus === 'REJECTED' ? (reason || 'Comprobante no verificado') : null,
      })
      .eq('id', id);

    if (updateErr) {
      throw new Error(`Error actualizando manual_payments: ${updateErr.message}`);
    }

    // 5. ACCIONES ESPECÍFICAS SEGÚN ACCIÓN
    if (newStatus === 'APPROVED') {
      // 5.1 Conceder Early Access si aplica
      if (payment.workspace_id && payment.product_id) {
        try {
          await supabaseAdmin
            .from('early_access_grants')
            .upsert({
              workspace_id: payment.workspace_id,
              product_id: payment.product_id,
              granted_at: nowIso,
            });
        } catch (eaErr) {
          console.warn('[Console Approve] Early access grant warning:', eaErr);
        }
      }

      // 5.2 Activar / Crear Suscripción en public.subscriptions con fecha de corte
      if (payment.workspace_id && payment.price_id) {
        try {
          const { data: existingSubs } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('workspace_id', payment.workspace_id)
            .eq('price_id', payment.price_id);

          if (existingSubs && existingSubs.length > 0) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'active',
                next_billing_date: nextBillingIso,
                updated_at: nowIso,
                last_webhook_update: nowIso,
              })
              .eq('id', existingSubs[0].id);
          } else {
            await supabaseAdmin
              .from('subscriptions')
              .insert({
                id: crypto.randomUUID(),
                workspace_id: payment.workspace_id,
                price_id: payment.price_id,
                status: 'active',
                customer_id: payment.workspace_id,
                ls_subscription_id: payment.payment_id || `manual_${payment.id}`,
                next_billing_date: nextBillingIso,
                created_at: nowIso,
                updated_at: nowIso,
                last_webhook_update: nowIso,
              });
          }
        } catch (subErr) {
          console.warn('[Console Approve] Subscription activation warning:', subErr);
        }
      }

      // 5.3 Conceder Entitlements para el módulo correspondiente (tabla física: workspace_entitlements)
      if (payment.workspace_id) {
        try {
          const { data: existingEnts } = await supabaseAdmin
            .from('workspace_entitlements')
            .select('id')
            .eq('workspace_id', payment.workspace_id)
            .eq('module_id', moduleId);

          if (existingEnts && existingEnts.length > 0) {
            await supabaseAdmin
              .from('workspace_entitlements')
              .update({
                status: 'active',
                updated_at: nowIso,
              })
              .eq('id', existingEnts[0].id);
          } else {
            await supabaseAdmin
              .from('workspace_entitlements')
              .insert({
                id: crypto.randomUUID(),
                workspace_id: payment.workspace_id,
                module_id: moduleId,
                source_type: 'subscription_item',
                status: 'active',
                created_at: nowIso,
                updated_at: nowIso,
              });
          }
        } catch (entErr) {
          console.warn('[Console Approve] Entitlements grant warning:', entErr);
        }

        // 5.4 Sincronizar workspaces: active_modules, subscription_status, plan_type y next_billing_date
        try {
          const { data: wsData } = await supabaseAdmin
            .from('workspaces')
            .select('active_modules')
            .eq('id', payment.workspace_id)
            .single();

          const currentModules = new Set<string>(wsData?.active_modules || []);
          currentModules.add(moduleId);

          await supabaseAdmin
            .from('workspaces')
            .update({
              subscription_status: 'active',
              plan_type: billingInterval === 'year' ? 'annual' : 'monthly',
              next_billing_date: nextBillingIso,
              active_modules: Array.from(currentModules),
              last_webhook_update: nowIso,
            })
            .eq('id', payment.workspace_id);
        } catch (wsErr) {
          console.warn('[Console Approve] Workspace active_modules update warning:', wsErr);
        }

        // 5.5 Registrar en audit_logs para que Core notifique al usuario en la campana
        try {
          await supabaseAdmin
            .from('audit_logs')
            .insert({
              id: crypto.randomUUID(),
              workspace_id: payment.workspace_id,
              actor_email: 'admin@axiomadynamics.com',
              actor_name: 'Axioma Console Admin',
              action: 'MANUAL_PAYMENT_APPROVED',
              module: 'billing',
              target_type: 'payment',
              target_id: payment.id,
              summary: `Pago aprobado exitosamente para ${payment.product_name}. Tu suscripción está activa hasta el ${nextBillingDate.toLocaleDateString('es-ES')}.`,
              metadata: {
                paymentId: payment.id,
                reference: payment.reference,
                amount: payment.amount,
                currency: payment.currency,
                product: payment.product_name,
                plan: payment.plan_name,
                module: moduleId,
                nextBillingDate: nextBillingIso,
                billingInterval: billingInterval,
              },
              created_at: nowIso,
            });
        } catch (auditErr) {
          console.warn('[Console Approve] Audit log insert warning:', auditErr);
        }
      }
    } else if (newStatus === 'REJECTED') {
      // Registrar en audit_logs de Core la notificación de rechazo con el motivo
      if (payment.workspace_id) {
        try {
          await supabaseAdmin
            .from('audit_logs')
            .insert({
              id: crypto.randomUUID(),
              workspace_id: payment.workspace_id,
              actor_email: 'admin@axiomadynamics.com',
              actor_name: 'Axioma Console Admin',
              action: 'MANUAL_PAYMENT_REJECTED',
              module: 'billing',
              target_type: 'payment',
              target_id: payment.id,
              summary: reason ? `Pago rechazado: ${reason}` : 'Pago rechazado por verificación administrativa.',
              metadata: {
                reason: reason || 'Comprobante no verificado',
                paymentId: payment.id,
                reference: payment.reference,
                amount: payment.amount,
                currency: payment.currency,
                product: payment.product_name,
                plan: payment.plan_name,
              },
              created_at: nowIso,
            });
        } catch (auditErr) {
          console.warn('[Console Reject] Audit log insert warning:', auditErr);
        }
      }
    }

    // 6. Enviar notificación a Telegram con el resultado
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (botToken && adminChatId) {
      const isApproved = newStatus === 'APPROVED';
      const icon = isApproved ? '✅' : '❌';
      const title = isApproved ? 'PAGO APROBADO Y ACCESO CONCEDIDO' : 'PAGO RECHAZADO';
      const clinic = payment.workspace_name;
      const product = `${payment.product_name} (${payment.plan_name})`;
      const amountStr = payment.amount === 0 ? 'ACCESO DEMO' : `$${(payment.amount / 100).toFixed(2)} ${payment.currency || 'USD'}`;

      const text = `${icon} *${title}*\n\n` +
                   `*Clínica / Negocio:* ${clinic}\n` +
                   `*Producto:* ${product}\n` +
                   `*Monto:* \`${amountStr}\`\n` +
                   `*Comprobante:* \`${payment.reference}\`\n` +
                   `*Fecha Revisión:* ${now.toLocaleString('es-ES')}\n` +
                   (isApproved ? `*Próximo Corte / Facturación:* \`${nextBillingDate.toLocaleDateString('es-ES')}\` (${billingInterval === 'year' ? 'Anual' : 'Mensual'})\n` : '') +
                   (reason ? `*Motivo del Rechazo:* ${reason}\n` : '');

      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text,
          parse_mode: 'Markdown',
        }),
      }).catch((e) => console.warn('[Telegram Alert] Error enviando alerta:', e));
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err: any) {
    console.error('[Console Payments Action] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('manual_payments')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[Console Payments Delete] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
