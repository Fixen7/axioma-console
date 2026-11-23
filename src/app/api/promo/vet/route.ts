import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const PROMO_START_DATE = '2026-11-14T00:00:00.000Z';
  const PROMO_MAX_SLOTS = 10;
  const PROD_VET_KEY = 'axioma-vet';

  let earlyGrantsCount = 0;
  let manualApprovedCount = 0;

  try {
    let productId: string | undefined;

    // 1. Intento vía sql directo
    try {
      const products = await sql`
        SELECT id FROM "products" WHERE key = ${PROD_VET_KEY} LIMIT 1
      `;
      productId = products?.[0]?.id;

      if (productId) {
        const grants = await sql`
          SELECT count(*)::int as count 
          FROM "early_access_grants" 
          WHERE product_id = ${productId} AND granted_at >= ${PROMO_START_DATE}
        `;
        earlyGrantsCount = grants?.[0]?.count || 0;

        const manual = await sql`
          SELECT count(*)::int as count 
          FROM "manual_payments" 
          WHERE product_id = ${productId} AND status = 'APPROVED' AND created_at >= ${PROMO_START_DATE}
        `;
        manualApprovedCount = manual?.[0]?.count || 0;
      }
    } catch (sqlErr) {
      console.warn('[API Promo Vet] sql directo falló, usando fallback supabaseAdmin:', sqlErr);

      // Fallback robusto con supabaseAdmin
      const { data: prodData } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('key', PROD_VET_KEY)
        .maybeSingle();

      productId = prodData?.id;

      if (productId) {
        const { count: grantsCnt } = await supabaseAdmin
          .from('early_access_grants')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', productId)
          .gte('granted_at', PROMO_START_DATE);

        earlyGrantsCount = grantsCnt || 0;

        const { count: manualCnt } = await supabaseAdmin
          .from('manual_payments')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', productId)
          .eq('status', 'APPROVED')
          .gte('created_at', PROMO_START_DATE);

        manualApprovedCount = manualCnt || 0;
      }
    }

    const paidUsersCount = Math.max(earlyGrantsCount, manualApprovedCount);
    const remainingSlots = Math.max(0, PROMO_MAX_SLOTS - paidUsersCount);
    const isPromoActive = remainingSlots > 0;

    return NextResponse.json({
      productKey: PROD_VET_KEY,
      isPromoActive,
      maxSlots: PROMO_MAX_SLOTS,
      paidUsersCount,
      remainingSlots,
      prices: {
        promo: {
          monthly: 10,
          yearly: 100,
          ecuadorIvaMonthly: 11.5,
          ecuadorIvaYearly: 115,
        },
        regular: {
          monthly: 15,
          yearly: 150,
          ecuadorIvaMonthly: 17.25,
          ecuadorIvaYearly: 172.5,
        },
      },
      updatedAt: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: any) {
    console.error('[API Promo Vet] Fallback crítico:', error);
    return NextResponse.json({
      productKey: PROD_VET_KEY,
      isPromoActive: true,
      maxSlots: PROMO_MAX_SLOTS,
      paidUsersCount: 0,
      remainingSlots: 10,
      prices: {
        promo: { monthly: 10, yearly: 100, ecuadorIvaMonthly: 11.5, ecuadorIvaYearly: 115 },
        regular: { monthly: 15, yearly: 150, ecuadorIvaMonthly: 17.25, ecuadorIvaYearly: 172.5 },
      },
      updatedAt: new Date().toISOString(),
      fallback: true
    }, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  }
}
