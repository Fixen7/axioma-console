import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const coreUrl = process.env.AXIOMA_CORE_API_URL || 'https://core.axiomadynamics.com';

  // Usamos el SSO de Axioma Core que ya cuenta con Google OAuth totalmente autorizado en Supabase
  const targetUrl = `${coreUrl}/api/auth/oauth?provider=google&returnTo=${encodeURIComponent(origin)}`;
  return NextResponse.redirect(targetUrl);
}
