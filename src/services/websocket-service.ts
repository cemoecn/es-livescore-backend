/**
 * WebSocket Service for TheSports MQTT Real-time Updates
 * Connects to wss://mq.thesports.com for instant match updates
 */

import { supabase } from '@/lib/supabase';
import mqtt, { MqttClient } from 'mqtt';

const MQTT_HOST = process.env.THESPORTS_MQTT_HOST || 'mq.thesports.com';
const MQTT_PORT = process.env.THESPORTS_MQTT_PORT || '8084';
const USERNAME = process.env.THESPORTS_USERNAME || '';
const API_KEY = process.env.THESPORTS_API_KEY || '';

let client: MqttClient | null = null;
let isConnecting = false;

// Topics to subscribe to
// According to TheSports docs, ALL real-time updates (score, status, incidents, stats)
// come through the single match/v1 topic - there is no separate incident topic!
const TOPICS = [
    'thesports/football/match/v1', // ALL live updates: score, status, incidents, stats
];

interface MqttMatchUpdate {
    id: string;
    status_id?: number;
    home_score?: number;
    away_score?: number;
    minute?: number;
    home_team_id?: string;
    away_team_id?: string;
    competition_id?: string;
}

interface MqttIncidentUpdate {
    match_id: string;
    type: number;
    time?: number;
    position?: number;
    player_id?: string;
    player_name?: string;
    player2_id?: string;
    player2_name?: string;
    in_player_id?: string;
    in_player_name?: string;
    out_player_id?: string;
    out_player_name?: string;
    home_score?: number;
    away_score?: number;
}

// Status mapping
const STATUS_MAP: Record<number, string> = {
    0: 'scheduled',
    1: 'live',
    2: 'live',
    3: 'live',
    4: 'halftime',
    5: 'live',
    6: 'live',
    7: 'live',
    8: 'finished',
    9: 'finished',
    10: 'postponed',
    11: 'cancelled',
    12: 'interrupted',
    13: 'suspended',
};

/**
 * Handle incoming match update
 * Uses UPSERT to prevent race conditions and duplicate key errors
 * 
 * TheSports WebSocket sends data in this format:
 * { id, score: [matchId, statusId, homeScores[], awayScores[], minute, extra], stats, incidents, tlive }
 * 
 * Status IDs:
 * 1 = First half
 * 2 = First half (injury time)
 * 3 = Half-time break
 * 4 = Half-time (interval)
 * 5 = Second half
 * 6 = Second half (injury time)
 * 7 = Extra time
 * 8 = Finished
 */
async function handleMatchUpdate(data: any) {
    try {
        // Parse the score array if present
        // Format: [matchId, statusId, homeScores[], awayScores[], kickoffTimestamp, extra]
        // According to TheSports docs, position 4 is the kick-off timestamp, NOT the minute!
        // We need to calculate: minute = (now - kickoffTimestamp) / 60000
        // For second half, the kickoffTimestamp is the 2nd half kickoff, so we add 45
        const scoreData = data.score;

        let statusId: number;
        let homeScore: number;
        let awayScore: number;
        let minute: number | null = null;

        if (Array.isArray(scoreData) && scoreData.length >= 5) {
            // New format with score array
            statusId = scoreData[1] ?? 1;
            const homeScores = scoreData[2];
            const awayScores = scoreData[3];
            homeScore = Array.isArray(homeScores) ? (homeScores[0] || 0) : (homeScores || 0);
            awayScore = Array.isArray(awayScores) ? (awayScores[0] || 0) : (awayScores || 0);

            // Position 4: Could be kick-off timestamp OR direct minute value
            // If it's a large number (> 1000000000), it's a Unix timestamp
            // If it's a small number (< 200), it's a direct minute value
            const rawValue = scoreData[4];

            console.log(`[WS] Match ${data.id}: rawValue=${rawValue}, typeof=${typeof rawValue}`);

            if (rawValue !== null && rawValue !== undefined) {
                let parsedMinute: number | null = null;

                if (typeof rawValue === 'number') {
                    if (rawValue > 1000000000) {
                        // It's a Unix timestamp (seconds) - calculate minute from it
                        const kickoffTime = rawValue * 1000; // Convert to milliseconds
                        const now = Date.now();
                        const elapsedMs = now - kickoffTime;
                        parsedMinute = Math.floor(elapsedMs / 60000);
                        console.log(`[WS] Timestamp mode: kickoff=${kickoffTime}, now=${now}, elapsed=${elapsedMs}ms, minute=${parsedMinute}`);
                    } else {
                        // It's a direct minute value
                        parsedMinute = rawValue;
                    }
                } else if (typeof rawValue === 'string') {
                    // Handle formats like "45+2" -> 47, or just "67" -> 67
                    const str = rawValue;
                    if (str.includes('+')) {
                        const parts = str.split('+');
                        parsedMinute = parseInt(parts[0], 10) + parseInt(parts[1], 10);
                    } else {
                        parsedMinute = parseInt(str, 10);
                    }
                    if (isNaN(parsedMinute)) parsedMinute = null;
                }

                // Adjust minute based on match status
                // Status 3/4 = halftime, minute should be null
                // Status 5/6 = second half, add 45 (timestamp is 2nd half kickoff)
                // Status 7 = extra time, add 90
                // Status 8 = finished
                if (parsedMinute !== null && parsedMinute >= 0) {
                    if (statusId === 3 || statusId === 4) {
                        // Halftime - don't show a minute, use null
                        minute = null;
                    } else if (statusId === 5 || statusId === 6) {
                        // Second half - add 45 since kickoff timestamp is for 2nd half
                        minute = parsedMinute + 45;
                    } else if (statusId === 7) {
                        // Extra time - add 90
                        minute = parsedMinute + 90;
                    } else if (statusId === 8) {
                        // Finished - don't need minute
                        minute = null;
                    } else {
                        // First half (1,2) or scheduled (0) - use as is
                        minute = parsedMinute;
                    }
                }
            }

            console.log(`[WS] Match ${data.id}: statusId=${statusId}, rawValue=${JSON.stringify(rawValue)}, finalMinute=${minute}`);
        } else {
            // Fallback to flat format
            statusId = data.status_id ?? 1;
            homeScore = data.home_score ?? 0;
            awayScore = data.away_score ?? 0;
            minute = data.minute ?? null;
        }

        const status = STATUS_MAP[statusId] || 'unknown';

        console.log(`[WS] Match ${data.id}: ${status}, score=${homeScore}-${awayScore}, minute=${minute}`);

        // Use UPSERT (insert with onConflict) to handle both new and existing matches
        const { error } = await supabase
            .from('matches')
            .upsert(
                {
                    id: data.id,
                    status: status,
                    minute: minute,
                    home_score: homeScore,
                    away_score: awayScore,
                    home_team_id: data.home_team_id || null,
                    away_team_id: data.away_team_id || null,
                    competition_id: data.competition_id || null,
                    start_time: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'id',
                    ignoreDuplicates: false,
                }
            );

        if (error) {
            console.error('[WS] Match upsert error:', error.message);
        }
    } catch (error) {
        console.error('[WS] Error handling match update:', error);
    }
}

/**
 * Handle incoming incidents message
 * The WebSocket sends the COMPLETE list of incidents for a match on each update
 * So we need to REPLACE all events for that match, not append
 */
async function handleIncidentsMessage(matchId: string, incidents: MqttIncidentUpdate[]) {
    try {
        if (!matchId || !incidents || incidents.length === 0) {
            return;
        }

        console.log(`[WS] Processing ${incidents.length} incidents for match ${matchId}`);

        // Strategy: Delete all existing events for this match, then insert fresh ones
        // This ensures we always have the correct, deduplicated list

        // Step 1: Delete all existing events for this match
        const { error: deleteError } = await supabase
            .from('match_events')
            .delete()
            .eq('match_id', matchId);

        if (deleteError) {
            console.error(`[WS] Error deleting old events for ${matchId}:`, deleteError.message);
            // Continue anyway to try inserting
        }

        // Step 2: Insert all new events
        const eventsToInsert = incidents.map(incident => ({
            match_id: matchId,
            type: incident.type,
            time: incident.time ?? null,
            position: incident.position ?? null,
            player_id: incident.player_id ?? null,
            player_name: incident.player_name ?? null,
            player2_id: incident.player2_id ?? null,
            player2_name: incident.player2_name ?? null,
            in_player_id: incident.in_player_id ?? null,
            in_player_name: incident.in_player_name ?? null,
            out_player_id: incident.out_player_id ?? null,
            out_player_name: incident.out_player_name ?? null,
            home_score: incident.home_score ?? null,
            away_score: incident.away_score ?? null,
        }));

        const { error: insertError } = await supabase
            .from('match_events')
            .insert(eventsToInsert);

        if (insertError) {
            console.error(`[WS] Error inserting events for ${matchId}:`, insertError.message);
        } else {
            console.log(`[WS] ✓ Synced ${incidents.length} events for match ${matchId}`);
        }

        // Update match score from the latest goal incident
        const goalIncidents = incidents.filter(i => i.type === 1); // type 1 = goal
        if (goalIncidents.length > 0) {
            const lastGoal = goalIncidents[goalIncidents.length - 1];
            if (lastGoal.home_score !== undefined && lastGoal.away_score !== undefined) {
                await supabase
                    .from('matches')
                    .update({
                        home_score: lastGoal.home_score,
                        away_score: lastGoal.away_score,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', matchId);
            }
        }
    } catch (error) {
        console.error('[WS] Error handling incidents:', error);
    }
}

/**
 * Connect to MQTT broker
 */
export function connectMqtt(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (client?.connected) {
            console.log('[WS] Already connected');
            resolve();
            return;
        }

        if (isConnecting) {
            console.log('[WS] Connection already in progress');
            resolve();
            return;
        }

        if (!USERNAME || !API_KEY) {
            console.warn('[WS] MQTT credentials not configured. Skipping WebSocket connection.');
            resolve();
            return;
        }

        isConnecting = true;
        const url = `wss://${MQTT_HOST}:${MQTT_PORT}/mqtt`;

        console.log(`[WS] Connecting to ${url}...`);

        client = mqtt.connect(url, {
            username: USERNAME,
            password: API_KEY,
            clientId: `es-livescore-${Date.now()}`,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 30000,
            protocolVersion: 4,
            // Skip SSL certificate verification (TheSports uses a cert that can't be verified)
            rejectUnauthorized: false,
        });

        client.on('connect', () => {
            console.log('[WS] Connected to TheSports MQTT!');
            isConnecting = false;

            // Subscribe to topics
            TOPICS.forEach(topic => {
                client?.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`[WS] Failed to subscribe to ${topic}:`, err);
                    } else {
                        console.log(`[WS] Subscribed to ${topic}`);
                    }
                });
            });

            resolve();
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());

                // All updates come via thesports/football/match/v1 topic
                // Each message contains: id, score, stats, incidents, tlive
                const updates = Array.isArray(data) ? data : [data];

                for (const update of updates) {
                    const matchId = update.id;
                    if (!matchId) continue;

                    // Handle match score/status updates
                    handleMatchUpdate(update);

                    // Handle incidents if present in this update
                    if (update.incidents && Array.isArray(update.incidents) && update.incidents.length > 0) {
                        console.log(`[WS] Match ${matchId} has ${update.incidents.length} incidents`);
                        handleIncidentsMessage(matchId, update.incidents);
                    }
                }
            } catch (error) {
                console.error('[WS] Error parsing message:', error);
            }
        });

        client.on('error', (error) => {
            console.error('[WS] Connection error:', error);
            isConnecting = false;
        });

        client.on('close', () => {
            console.log('[WS] Connection closed');
            isConnecting = false;
        });

        client.on('reconnect', () => {
            console.log('[WS] Reconnecting...');
        });

        // Timeout if connection takes too long
        setTimeout(() => {
            if (isConnecting) {
                isConnecting = false;
                console.warn('[WS] Connection timeout - continuing with HTTP polling');
                resolve();
            }
        }, 10000);
    });
}

/**
 * Disconnect from MQTT broker
 */
export function disconnectMqtt(): Promise<void> {
    return new Promise((resolve) => {
        if (client) {
            client.end(true, {}, () => {
                console.log('[WS] Disconnected');
                client = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
    return client?.connected || false;
}

export const WebSocketService = {
    connect: connectMqtt,
    disconnect: disconnectMqtt,
    isConnected,
};

export default WebSocketService;
