import { NextResponse } from 'next/server';
import { getAppVersion } from '@/lib/app-version';

// 版本来自运行时环境变量，不能在构建时静态化
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ version: getAppVersion() });
}
