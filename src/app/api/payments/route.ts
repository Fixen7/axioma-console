import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Consultar pagos manuales o solicitudes de demo pendientes con joins SQL puros
    const rows = await sql`
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
        pl.name as plan_name
      FROM "manual_payments" mp
      LEFT JOIN "workspaces" w ON mp.workspace_id = w.id
      LEFT JOIN "products" pr ON mp.product_id = pr.id
      LEFT JOIN "plans" pl ON mp.plan_id = pl.id
      ORDER BY mp.created_at DESC
      LIMIT 100
    `;

    // Normalizar datos para la interfaz
    const normalized = rows.map((p: any) => ({
      id: p.id,
      workspaceName: p.workspace_name || 'Clínica Sin Nombre',
      productName: p.product_name || 'Axioma App',
      planName: p.plan_name || (p.amount === 0 ? 'Acceso Demo' : 'Plan Estándar'),
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
