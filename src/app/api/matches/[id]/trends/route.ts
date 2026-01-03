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
        // API returns arrays like [16, 0, -2], [-16, 0, 1] per half
        // Format: [value, eventType, minuteChange]
        // value: positive = home team momentum, negative = away team

        const firstHalf: TrendData[] = [];
        const secondHalf: TrendData[] = [];

        if (rawData.length >= 1 && Array.isArray(rawData[0])) {
            // First half data
            let minute = 0;
            for (const entry of rawData[0]) {
                if (Array.isArray(entry) && entry.length >= 3) {
                    minute += Math.abs(entry[2]); // Add minute change
                    firstHalf.push({
                        minute,
                        value: entry[0],
                        eventType: entry[1],
                    });
                }
            }
        }

        if (rawData.length >= 2 && Array.isArray(rawData[1])) {
            // Second half data
            let minute = 45; // Start from 45
            for (const entry of rawData[1]) {
                if (Array.isArray(entry) && entry.length >= 3) {
                    minute += Math.abs(entry[2]); // Add minute change
                    secondHalf.push({
                        minute,
                        value: entry[0],
                        eventType: entry[1],
                    });
                }
            }
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
