/**
 * Debug endpoint to test TheSports API directly with detailed logging
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    // Test multiple endpoints with correct paths from documentation
    const endpoints = [
        // BASIC INFO - these should work
        '/v1/football/category/list',
        '/v1/football/country/list',

        // Competition endpoints
        '/v1/football/competition/list',              // Standard (may fail)
        '/v1/football/competition/additional/list',   // Additional (works!)

        // Match endpoints - testing different path patterns
        '/v1/football/match/recent',                  // Old (probably fails)
        '/v1/football/match/recent/list',             // With /list suffix
        '/v1/football/match/additional/recent',       // With /additional/ prefix
        '/v1/football/match/additional/recent/list',  // Both

        // Diary/Schedule endpoints
        '/v1/football/match/diary',                   // Standard  
        '/v1/football/match/diary/list',              // With /list suffix
        '/v1/football/match/additional/diary',        // With /additional/ prefix
    ];

    const results: Record<string, { url: string; status?: number; response?: unknown; error?: string }> = {};

    for (const endpoint of endpoints) {
        const url = `${API_URL}${endpoint}?user=${USERNAME}&secret=${API_KEY}`;

        try {
            console.log(`Testing endpoint: ${endpoint}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            });

            const data = await response.json();

            results[endpoint] = {
                url: url.replace(API_KEY, '***'),
                status: response.status,
                response: data.err ? { error: data.err } : {
                    success: true,
                    code: data.code,
                    dataCount: Array.isArray(data.data) ? data.data.length :
                        (data.data?.results ? data.data.results.length : 'N/A'),
                    hasData: !!data.data
                },
            };
        } catch (error) {
            results[endpoint] = {
                url: url.replace(API_KEY, '***'),
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        config: {
            apiUrl: API_URL,
            username: USERNAME,
            hasApiKey: !!API_KEY,
        },
        results,
    });
}
