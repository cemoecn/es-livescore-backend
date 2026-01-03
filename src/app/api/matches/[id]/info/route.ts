/**
 * GET /api/matches/[id]/info
 * Returns additional match information: venue, referee, environment (weather)
 * Uses TheSports APIs directly for all data
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Weather code to German label mapping
const WEATHER_LABELS: Record<number, string> = {
    1: 'Teilweise bewölkt',
    2: 'Bewölkt',
    3: 'Teilweise bewölkt/Regen',
    4: 'Schnee',
    5: 'Sonnig',
    6: 'Bedeckt/Gewitter',
    7: 'Bedeckt',
    8: 'Nebelig',
    9: 'Bedeckt mit Regen',
    10: 'Bewölkt mit Regen',
    11: 'Bewölkt mit Regen/Gewitter',
    12: 'Wolken/Regen/Gewitter lokal',
    13: 'Nebel',
};

// Weather code to icon mapping
const WEATHER_ICONS: Record<number, string> = {
    1: '⛅',
    2: '☁️',
    3: '🌦️',
    4: '❄️',
    5: '☀️',
    6: '⛈️',
    7: '☁️',
    8: '🌫️',
    9: '🌧️',
    10: '🌧️',
    11: '⛈️',
    12: '⛈️',
    13: '🌫️',
};

// Helper to format values - handle both raw numbers and already-formatted strings
const formatTemp = (val: unknown): string | null => {
    if (val == null) return null;
    const str = String(val);
    if (str.includes('°')) return str;
    return `${str}°C`;
};

const formatHumidity = (val: unknown): string | null => {
    if (val == null) return null;
    const str = String(val);
    if (str.includes('%')) return str;
    return `${str}%`;
};

const formatWind = (val: unknown): string | null => {
    if (val == null) return null;
    const str = String(val);
    if (str.includes('m/s') || str.includes('km/h')) return str;
    return `${str} m/s`;
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: matchId } = await params;

        // Fetch match detail from TheSports API using match/recent/list
        const response = await fetch(
            `${API_URL}/v1/football/match/recent/list?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}`
        );
        const apiData = await response.json();

        if (apiData.err) {
            return NextResponse.json({
                success: false,
                error: apiData.err,
            }, { status: 400 });
        }

        const matchData = apiData.results?.[0] || apiData.results || {};

        // Extract venue, referee, environment
        const venueId = matchData.venue_id || null;
        const refereeId = matchData.referee_id || null;
        const environment = matchData.environment || null;

        // Fetch venue details from TheSports API if we have venue_id
        let venueInfo: { id: string; name: string; city: string | null; capacity: number | null } | null = null;

        if (venueId) {
            try {
                const venueResponse = await fetch(
                    `${API_URL}/v1/football/venue/list?user=${USERNAME}&secret=${API_KEY}&uuid=${venueId}`
                );
                const venueData = await venueResponse.json();
                const venue = venueData.results?.[0] || venueData.results;

                if (venue && venue.name) {
                    venueInfo = {
                        id: venueId,
                        name: venue.name,
                        city: venue.city || null,
                        capacity: venue.capacity ? parseInt(venue.capacity, 10) : null,
                    };
                }
            } catch (e) {
                console.error('Error fetching venue:', e);
            }
        }

        // Fetch referee details from TheSports API if we have referee_id
        let refereeInfo: {
            id: string;
            name: string;
            country: string | null;
            birthday: string | null;
            age: number | null;
            logo: string | null;
        } | null = null;

        if (refereeId) {
            try {
                const refereeResponse = await fetch(
                    `${API_URL}/v1/football/referee/list?user=${USERNAME}&secret=${API_KEY}&uuid=${refereeId}`
                );
                const refereeData = await refereeResponse.json();
                const referee = refereeData.results?.[0] || refereeData.results;

                // Log all available fields for debugging
                console.log('[Referee API] Full response:', JSON.stringify(referee, null, 2));

                if (referee && referee.name) {
                    // Format birthday from Unix timestamp
                    let birthdayFormatted: string | null = null;
                    let age: number | null = null;

                    const birthdayTimestamp = referee.birthday || referee.birth_date;
                    if (birthdayTimestamp && typeof birthdayTimestamp === 'number') {
                        const birthDate = new Date(birthdayTimestamp * 1000);
                        birthdayFormatted = birthDate.toLocaleDateString('de-DE', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        });
                        // Calculate age
                        const today = new Date();
                        age = today.getFullYear() - birthDate.getFullYear();
                        const monthDiff = today.getMonth() - birthDate.getMonth();
                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                            age--;
                        }
                    }

                    refereeInfo = {
                        id: refereeId,
                        name: referee.name,
                        country: referee.country_name || referee.nationality || referee.country || null,
                        birthday: birthdayFormatted,
                        age: age,
                        logo: referee.logo || referee.photo || null,
                    };
                }
            } catch (e) {
                console.error('Error fetching referee:', e);
            }
        }

        // Parse environment data
        let weatherInfo = null;
        if (environment) {
            const weatherCode = environment.weather;
            weatherInfo = {
                weather: WEATHER_LABELS[weatherCode] || null,
                weatherIcon: WEATHER_ICONS[weatherCode] || '🌡️',
                weatherCode: weatherCode,
                temperature: formatTemp(environment.temperature),
                humidity: formatHumidity(environment.humidity),
                wind: formatWind(environment.wind),
                pressure: environment.pressure != null ? `${environment.pressure}` : null,
            };
        }

        return NextResponse.json({
            success: true,
            data: {
                venue: venueInfo,
                referee: refereeInfo,
                environment: weatherInfo,
            },
            debug: {
                venueId,
                refereeId,
                hasEnvironment: !!environment,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match info:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
