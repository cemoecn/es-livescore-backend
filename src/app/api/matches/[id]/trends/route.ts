/**
 * GET /api/matches/[id]/trends
 * Returns match trend data (momentum/pressure per minute)
 * Uses TheSports API /v1/football/match/trend/detail
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export interface TrendData {
    minute: number;
    value: number;    // Positive = home team, Negative = away team
    eventType: number; // 0 = normal, 1 = goal, -1 = other event
}

export interface MatchTrendsResponse {
    halfCount: number;
    halfTime: number;
    firstHalf: TrendData[];
    secondHalf: TrendData[];
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: matchId } = await params;

        // Fetch trend data from TheSports API
        const response = await fetch(
            `${API_URL}/v1/football/match/trend/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}`
        );
        const apiData = await response.json();

        if (apiData.err) {
            return NextResponse.json({
                success: false,
                error: apiData.err,
            }, { status: 400 });
        }

        const results = apiData.results || {};
        const halfCount = results.count || 2;
        const halfTime = results.per || 45;
        const rawData = results.data || [];

        // Parse the trend data
        // API returns simple arrays of momentum values per minute
        // Each value: positive = home team momentum, negative = away team
        // First array = first half, Second array = second half

        const firstHalf: TrendData[] = [];
        const secondHalf: TrendData[] = [];

        if (rawData.length >= 1 && Array.isArray(rawData[0])) {
            // First half data - each entry is just a momentum value
            rawData[0].forEach((value: number, index: number) => {
                if (typeof value === 'number') {
                    firstHalf.push({
                        minute: index + 1,
                        value: value,
                        eventType: 0,
                    });
                }
            });
        }

        if (rawData.length >= 2 && Array.isArray(rawData[1])) {
            // Second half data - starts at minute 46
            rawData[1].forEach((value: number, index: number) => {
                if (typeof value === 'number') {
                    secondHalf.push({
                        minute: 46 + index,
                        value: value,
                        eventType: 0,
                    });
                }
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                halfCount,
                halfTime,
                firstHalf,
                secondHalf,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match trends:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
