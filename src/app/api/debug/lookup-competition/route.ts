/**
 * Debug endpoint to look up a specific competition by ID
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('id') || 'l965mkyhrw1r1ge';

    try {
        // Try to get the competition from the additional list
        const url = `${API_URL}/v1/football/competition/additional/list?user=${USERNAME}&secret=${API_KEY}&uuid=${competitionId}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        const data = await response.json();

        return NextResponse.json({
            competitionId,
            rawResponse: data,
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
