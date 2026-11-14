import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

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
  try {
    const PROMO_START_DATE = '2026-11-14T00:00:00.000Z';
    const PROMO_MAX_SLOTS = 10;
    const PROD_VET_KEY = 'axioma-vet';

    // 1. Obtener ID del producto Vet
    const products = await sql`
      SELECT id FROM "products" WHERE key = ${PROD_VET_KEY} LIMIT 1
    `;
    const productId = products?.[0]?.id;

    let earlyGrantsCount = 0;
    let manualApprovedCount = 0;

    if (productId) {
      // 2. Conteo de accesos tempranos otorgados
      const grants = await sql`
        SELECT count(*)::int as count 
        FROM "early_access_grants" 
        WHERE product_id = ${productId} AND granted_at >= ${PROMO_START_DATE}
      `;
      earlyGrantsCount = grants?.[0]?.count || 0;

      // 3. Conteo de pagos manuales aprobados desde el inicio de la promo
      const manual = await sql`
        SELECT count(*)::int as count 
        FROM "manual_payments" 
        WHERE product_id = ${productId} AND status = 'APPROVED' AND created_at >= ${PROMO_START_DATE}
      `;
      manualApprovedCount = manual?.[0]?.count || 0;
    }

    // Regla de oro: Máximo entre accesos y pagos manuales (para evitar doble conteo)
    const paidUsersCount = Math.max(earlyGrantsCount, manualApprovedCount);
    const remainingSlots = Math.max(0, PROMO_MAX_SLOTS - paidUsersCount);
    const isPromoActive = remainingSlots > 0;

    const response = {
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
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: any) {
    console.error('[API Promo Vet] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch promo status',
        isPromoActive: true,
        remainingSlots: 10,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
