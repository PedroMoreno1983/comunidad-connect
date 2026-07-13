import { NextResponse } from 'next/server';
import { getProductCapabilities } from '@/lib/productCapabilities';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getProductCapabilities(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
