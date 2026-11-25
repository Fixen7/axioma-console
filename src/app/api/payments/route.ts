import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getConsoleSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getConsoleSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rows: any[] = [];

    if (process.env.DATABASE_URL) {
      try {
        rows = await sql`
          SELECT 
            mp.id,
            mp.payment_method,
            mp.amount,
            mp.currency,
            mp.reference,
            mp.payment_id,
            mp.status,
            mp.created_at,
            w.name as workspace_name,
            pr.name as product_name,
            pl.name as plan_name,
            prc.billing_interval
          FROM "manual_payments" mp
          LEFT JOIN "workspaces" w ON mp.workspace_id = w.id
          LEFT JOIN "products" pr ON mp.product_id = pr.id
          LEFT JOIN "plans" pl ON mp.plan_id = pl.id
          LEFT JOIN "prices" prc ON mp.price_id = prc.id
          ORDER BY mp.created_at DESC
          LIMIT 100
        `;
      } catch (sqlErr) {
        console.warn('[Console Payments] sql directo falló, usando fallback supabaseAdmin:', sqlErr);
      }
    }

    // Fallback con supabaseAdmin
    if (!rows || rows.length === 0) {
      const { data: rawPayments, error } = await supabaseAdmin
        .from('manual_payments')
        .select(`
          id,
          payment_method,
          amount,
          currency,
          reference,
          payment_id,
          status,
          created_at,
          workspace_id,
          product_id,
          plan_id,
          price_id
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      if (rawPayments && rawPayments.length > 0) {
        const workspaceIds = [...new Set(rawPayments.map(r => r.workspace_id).filter(Boolean))];
        const productIds = [...new Set(rawPayments.map(r => r.product_id).filter(Boolean))];
        const planIds = [...new Set(rawPayments.map(r => r.plan_id).filter(Boolean))];
        const priceIds = [...new Set(rawPayments.map(r => r.price_id).filter(Boolean))];

        const [wsRes, prRes, plRes, prcRes] = await Promise.all([
          workspaceIds.length ? supabaseAdmin.from('workspaces').select('id, name').in('id', workspaceIds) : { data: [] },
          productIds.length ? supabaseAdmin.from('products').select('id, name').in('id', productIds) : { data: [] },
          planIds.length ? supabaseAdmin.from('plans').select('id, name').in('id', planIds) : { data: [] },
          priceIds.length ? supabaseAdmin.from('prices').select('id, billing_interval').in('id', priceIds) : { data: [] },
        ]);

        const wsMap = new Map((wsRes.data || []).map((w: any) => [w.id, w.name]));
        const prMap = new Map((prRes.data || []).map((p: any) => [p.id, p.name]));
        const plMap = new Map((plRes.data || []).map((p: any) => [p.id, p.name]));
        const prcMap = new Map((prcRes.data || []).map((p: any) => [p.id, p.billing_interval]));

        rows = rawPayments.map((p: any) => ({
          ...p,
          workspace_name: wsMap.get(p.workspace_id) || null,
          product_name: prMap.get(p.product_id) || null,
          plan_name: plMap.get(p.plan_id) || null,
          billing_interval: prcMap.get(p.price_id) || 'month',
        }));
      } else {
        rows = [];
      }
    }

    // Normalizar datos para la interfaz
    const normalized = rows.map((p: any) => ({
      id: p.id,
      workspaceName: p.workspace_name || 'Clínica Sin Nombre',
      productName: p.product_name || 'Axioma App',
      planName: p.plan_name || (p.amount === 0 ? 'Acceso Demo' : 'Plan Estándar'),
      billingInterval: p.billing_interval || 'month',
      paymentMethod: p.payment_method || 'TRANSFER',
      amount: p.amount,
      currency: p.currency || 'USD',
      reference: p.reference || 'Sin comprobante',
      status: p.status,
      createdAt: p.created_at,
      isDemo: p.amount === 0 || (p.payment_method || '').toUpperCase().includes('DEMO'),
    }));

    return NextResponse.json(normalized);
  } catch (err: any) {
    console.error('[Console Payments] Fallo de servidor:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
