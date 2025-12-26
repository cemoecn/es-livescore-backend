/**
 * Debug endpoint to test diary endpoint with different date formats
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    // Test different date formats
    const dateFormats = [
        { format: 'YYYY-MM-DD', date: '2025-12-26' },
        { format: 'YYYYMMDD', date: '20251226' },
        { format: 'DD-MM-YYYY', date: '26-12-2025' },
        { format: 'Unix timestamp', date: '1735171200' },
        { format: 'No date param', date: null },
    ];

    const results: Record<string, unknown> = {};

    for (const { format, date } of dateFormats) {
        let url = `${API_URL}/v1/football/match/diary?user=${USERNAME}&secret=${API_KEY}`;
        if (date) {
            url += `&date=${date}`;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            });

            const data = await response.json();

            results[format] = {
                dateParam: date,
                success: !data.err,
                error: data.err,
                dataCount: data.data?.results?.length || (Array.isArray(data.data) ? data.data.length : 'N/A'),
                code: data.code,
                message: data.message,
            };
        } catch (error) {
            results[format] = {
                dateParam: date,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        results,
    });
}
