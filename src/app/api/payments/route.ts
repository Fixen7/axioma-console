import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Consultar pagos manuales o solicitudes de demo pendientes
    const { data: payments, error } = await supabaseAdmin
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
        workspace:workspaces(id, name),
        product:products(id, name),
        plan:plans(id, name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Console Payments] Error consultando pagos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Normalizar datos para la interfaz
    const normalized = (payments || []).map((p: any) => ({
      id: p.id,
      workspaceName: p.workspace?.name || 'Clínica Sin Nombre',
      productName: p.product?.name || 'Axioma App',
      planName: p.plan?.name || (p.amount === 0 ? 'Acceso Demo' : 'Plan Estándar'),
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
