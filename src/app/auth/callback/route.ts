import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE_NAME, createSessionToken, isAuthorizedAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error') || searchParams.get('error_description');

  if (errorParam) {
    console.error('[OAuth Callback Error]:', errorParam);
    return NextResponse.redirect(`${origin}/?error=oauth_error`);
  }

  // 1. Si viene authorization code (flujo PKCE estándar de Supabase)
  if (code) {
    try {
      const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        console.error('[OAuth Code Exchange Error]:', error);
        return NextResponse.redirect(`${origin}/?error=exchange_failed`);
      }

      const email = data.user.email;
      if (!isAuthorizedAdmin(email)) {
        console.warn(`[OAuth Unauthorized Access Attempt]: ${email}`);
        return NextResponse.redirect(`${origin}/?error=unauthorized_email`);
      }

      const sessionToken = createSessionToken(email!);
      const response = NextResponse.redirect(`${origin}/`);
      response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 días
      });

      return response;
    } catch (err) {
      console.error('[OAuth Callback Exception]:', err);
      return NextResponse.redirect(`${origin}/?error=internal_error`);
    }
  }

  // 2. Si no viene código en la URL (posible flujo hash #access_token de Supabase en cliente),
  // servimos un script liviano que captura el fragmento hash y lo valida
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Autenticando Axioma Console...</title>
    <style>
      body { background: #090d16; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    </style>
  </head>
  <body>
    <div>Verificando credenciales de Google...</div>
    <script>
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken })
        }).then(r => r.json()).then(data => {
          if (data.success) {
            window.location.href = '/';
          } else {
            window.location.href = '/?error=' + (data.error || 'unauthorized_email');
          }
        }).catch(() => {
          window.location.href = '/?error=connection_error';
        });
      } else {
        window.location.href = '/?error=no_token';
      }
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
