import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Check environment variables
        const envCheck = {
            hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
        };

        // Try to create client
        const supabase = await createClient();

        // Try to fetch from service_providers
        const { data, error, count } = await supabase
            .from('service_providers')
            .select('*', { count: 'exact' });

        return NextResponse.json({
            success: !error,
            envCheck,
            error: error ? {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
            } : null,
            dataCount: data?.length || 0,
            totalCount: count,
            sampleData: data?.[0] || null,
        });
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            error: {
                message: err.message,
                stack: err.stack,
            }
        });
    }
}
