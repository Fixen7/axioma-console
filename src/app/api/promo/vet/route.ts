import { NextResponse } from 'next/server';
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
  try {
    const PROMO_START_DATE = '2026-11-14T00:00:00.000Z';
    const PROMO_MAX_SLOTS = 10;
    const PROD_VET_KEY = 'axioma-vet';

    // 1. Get Vet product ID
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('key', PROD_VET_KEY)
      .limit(1);

    const productId = products?.[0]?.id;

    let earlyGrantsCount = 0;
    let manualApprovedCount = 0;

    if (productId) {
      // 2. Count grants granted from launch promo start
      const { count: grantsCount } = await supabaseAdmin
        .from('early_access_grants')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .gte('granted_at', PROMO_START_DATE);
      earlyGrantsCount = grantsCount || 0;

      // 3. Count approved manual payments for Vet from launch promo start
      const { count: manualCount } = await supabaseAdmin
        .from('manual_payments')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('status', 'APPROVED')
        .gte('created_at', PROMO_START_DATE);
      manualApprovedCount = manualCount || 0;
    }

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
