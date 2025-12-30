/**
 * GET /api/debug/inspect-season-table
 * Inspects the season/recent/table/detail API data structure
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}`
        );
        const data = await response.json();

        const rawData = data.data || data.results || data;

        // Check structure
        let structure = 'unknown';
        let sampleItem = null;
        let count = 0;

        if (Array.isArray(rawData)) {
            structure = 'array';
            count = rawData.length;
            sampleItem = rawData[0];
        } else if (typeof rawData === 'object' && rawData !== null) {
            structure = 'object';
            const keys = Object.keys(rawData);
            count = keys.length;
            if (keys.length > 0) {
                sampleItem = { key: keys[0], value: rawData[keys[0]] };
            }
        }

        return NextResponse.json({
            success: true,
            structure,
            count,
            sampleItem: sampleItem ? JSON.stringify(sampleItem).slice(0, 3000) : null,
            rawDataType: typeof rawData,
            hasData: !!rawData,
            code: data.code,
            message: data.message,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
