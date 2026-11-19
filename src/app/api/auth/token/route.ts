import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE_NAME, createSessionToken, isAuthorizedAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'Token no proporcionado' }, { status: 400 });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const email = user.email;
    if (!isAuthorizedAdmin(email)) {
      return NextResponse.json({ error: 'unauthorized_email' }, { status: 403 });
    }

    const sessionToken = createSessionToken(email!);
    const response = NextResponse.json({ success: true, email });
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
