import { NextResponse } from 'next/server';
import { getConsoleSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getConsoleSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    email: session.email,
  });
}
