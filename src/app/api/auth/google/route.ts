import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectTo = `${origin}/auth/callback`;

  const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error || !data?.url) {
    console.error('[Google OAuth Init Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'No se pudo inicializar Google OAuth' },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.url);
}
