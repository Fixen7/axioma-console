import crypto from 'crypto';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabaseAdmin';

export const AUTH_COOKIE_NAME = 'axioma_console_session';

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || 'roger145cabezas@gmail.com,roger@axiomadynamics.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuthorizedAdmin(email?: string | null): boolean {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.trim().toLowerCase());
}

export function createSessionToken(email: string): string {
  const secret = process.env.CONSOLE_SESSION_SECRET || 'AX2026Fxn19971554ConsoleAuthSecret';
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 días
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
  return `${b64Payload}.${sig}`;
}

export function verifySessionToken(token?: string | null): { email: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, sig] = parts;

  const secret = process.env.CONSOLE_SESSION_SECRET || 'AX2026Fxn19971554ConsoleAuthSecret';
  const expectedSig = crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
    if (!payload.exp || payload.exp < Date.now()) return null;

    if (!isAuthorizedAdmin(payload.email)) return null;

    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function getConsoleSession(): Promise<{ email: string } | null> {
  const cookieStore = await cookies();

  // 1. Verificar cookie directa de consola
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const directSession = verifySessionToken(sessionCookie?.value);
  if (directSession) return directSession;

  // 2. Verificar cookie de sesión SSO de Supabase compartida en .axiomadynamics.com
  const allCookies = cookieStore.getAll();
  const sbCookie = allCookies.find(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );

  if (sbCookie) {
    try {
      let rawVal = sbCookie.value;
      if (rawVal.startsWith('base64-')) {
        rawVal = Buffer.from(rawVal.replace('base64-', ''), 'base64').toString('utf-8');
      }
      const parsed = JSON.parse(rawVal);
      const accessToken = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed[0]);

      if (accessToken) {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (!error && user && user.email) {
          if (isAuthorizedAdmin(user.email)) {
            return { email: user.email };
          }
        }
      }
    } catch {
      // Ignorar fallo de parseo
    }
  }

  return null;
}
