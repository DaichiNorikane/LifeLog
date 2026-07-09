import { NextResponse } from 'next/server';
import { validateSignature } from '@/lib/line';
import { handleLineEvents } from '@/lib/line/router';

export async function POST(request) {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature');
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret) {
        console.error("LINE_CHANNEL_SECRET is missing");
        return NextResponse.json({ error: 'Config error' }, { status: 500 });
    }

    if (!validateSignature(body, channelSecret, signature)) {
        console.error("Signature validation FAILED");
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const payload = JSON.parse(body);
    await handleLineEvents(payload.events || []);
    return NextResponse.json({ status: 'success' });
}
