/**
 * GET /api/debug/ip
 * Returns the outbound IP of the server as seen by TheSports API
 */

import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch('https://api.thesports.com/v1/ip/demo', {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        const data = await response.json();

        return NextResponse.json({
            success: true,
            ipInfo: data,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
