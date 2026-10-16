import { loadSheetData } from '@/lib/sheet-server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  const data = await loadSheetData();
  return Response.json(data, { status: 'error' in data ? 502 : 200, headers });
}
