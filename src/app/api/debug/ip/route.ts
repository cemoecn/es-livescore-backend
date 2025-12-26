import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check the server's outbound IP address
 * This helps verify which IP TheSports.com sees when we make API calls
 */
export async function GET() {
    try {
        // Fetch our external IP from multiple services for verification
        const [ipifyResponse, httpbinResponse] = await Promise.allSettled([
            fetch('https://api.ipify.org?format=json'),
            fetch('https://httpbin.org/ip'),
        ]);

        const results: Record<string, string | null> = {
            ipify: null,
            httpbin: null,
        };

        if (ipifyResponse.status === 'fulfilled' && ipifyResponse.value.ok) {
            const data = await ipifyResponse.value.json();
            results.ipify = data.ip;
        }

        if (httpbinResponse.status === 'fulfilled' && httpbinResponse.value.ok) {
            const data = await httpbinResponse.value.json();
            results.httpbin = data.origin;
        }

        return NextResponse.json({
            success: true,
            message: 'External IP addresses detected',
            outboundIPs: results,
            timestamp: new Date().toISOString(),
            note: 'These are the IPs that external services see when this server makes requests. Add the IP shown here to TheSports.com whitelist.',
        });
    } catch (error) {
        console.error('Error fetching external IP:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic';
