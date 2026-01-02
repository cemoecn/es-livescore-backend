import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const uuid = searchParams.get('uuid') || 'gy0or5jhg6qwzv3'; // Default to Bundesliga

        const response = await fetch(
            `${API_URL}/v1/football/competition/additional/list?user=${USERNAME}&secret=${API_KEY}&uuid=${uuid}`
        );
        const data = await response.json();

        return NextResponse.json({
            success: true,
            rawResponse: data,
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
