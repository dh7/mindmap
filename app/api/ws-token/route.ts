import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const apiKey = process.env.MINDCACHE_API_KEY; // Server-side secret!
    const apiUrl = process.env.MINDCACHE_API_URL || 'https://api.mindcache.dev';
    const instanceId = request.nextUrl.searchParams.get('instanceId');

    if (!apiKey || !instanceId) {
        return NextResponse.json({ error: 'Missing config' }, { status: 500 });
    }

    // Determine auth header format based on key type
    const isDelegate = apiKey.startsWith('del_') && apiKey.includes(':');
    const authHeader = isDelegate ? `ApiKey ${apiKey}` : `Bearer ${apiKey}`;

    const response = await fetch(`${apiUrl}/api/ws-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({ instanceId, permission: 'write' })
    });

    const tokenData = await response.json();
    return NextResponse.json(tokenData);
}
