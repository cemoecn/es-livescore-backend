/**
 * Debug endpoint to check diary pagination
 */
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0].replace(/-/g, '');

    const results: { page: number; count: number; error?: string }[] = [];

    // Try pages 1-5
    for (let page = 1; page <= 5; page++) {
        try {
            const url = `${API_URL}/v1/football/match/diary?user=${USERNAME}&secret=${API_KEY}&date=${date}&page=${page}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            });

            const data = await response.json();
            const matches = data.results || data.data || [];

            results.push({
                page,
                count: Array.isArray(matches) ? matches.length : 0,
            });

            // If no matches, stop
            if (!matches.length) break;
        } catch (error) {
            results.push({
                page,
                count: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            break;
        }
    }

    const totalMatches = results.reduce((sum, r) => sum + r.count, 0);

    return NextResponse.json({
        date,
        totalMatches,
        pages: results,
    });
}

export const dynamic = 'force-dynamic';
