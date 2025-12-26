/**
 * Debug endpoint to test TheSports API directly with detailed logging
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    // Test multiple endpoints to see which ones work
    const endpoints = [
        '/v1/football/category/list',
        '/v1/football/country/list',
        '/v1/football/competition/list',
        '/v1/football/competition/additional/list',
    ];

    const results: Record<string, { url: string; status?: number; response?: unknown; error?: string }> = {};

    for (const endpoint of endpoints) {
        const url = `${API_URL}${endpoint}?user=${USERNAME}&secret=${API_KEY}`;

        try {
            console.log(`Testing endpoint: ${endpoint}`);
            console.log(`Full URL: ${url.replace(API_KEY, '***')}`);

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
                    dataCount: Array.isArray(data.data) ? data.data.length : 'N/A'
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
