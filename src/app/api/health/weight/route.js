import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase/admin';

const toFiniteNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const getJSTDateId = (date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
};

const parseMeasuredAt = (value) => {
    if (!value) return new Date();

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export async function POST(request) {
    const token = request.headers.get('x-widget-token');
    if (!token || token !== process.env.WIDGET_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { uid, weight, bodyFat, bmi, leanBodyMass, measuredAt } = body || {};

    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    if (weight === undefined || weight === null) {
        return NextResponse.json({ error: 'Missing weight' }, { status: 400 });
    }

    const weightValue = toFiniteNumber(weight);
    if (weightValue === null || weightValue <= 0 || weightValue >= 500) {
        return NextResponse.json({ error: 'Invalid weight' }, { status: 400 });
    }

    const measuredAtDate = parseMeasuredAt(measuredAt);
    if (!measuredAtDate) {
        return NextResponse.json({ error: 'Invalid measuredAt' }, { status: 400 });
    }

    const date = getJSTDateId(measuredAtDate);
    const bodyFatValue = toFiniteNumber(bodyFat);
    const bmiValue = toFiniteNumber(bmi);
    const leanBodyMassValue = toFiniteNumber(leanBodyMass);

    const payload = {
        weight: weightValue,
        bodyFat: bodyFatValue,
        bmi: bmiValue,
        leanBodyMass: leanBodyMassValue,
        date,
        timestamp: measuredAtDate.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        source: 'healthkit',
    };

    try {
        await db
            .collection('users')
            .doc(uid)
            .collection('weights')
            .doc(date)
            .set(payload, { merge: true });

        return NextResponse.json({
            success: true,
            date,
            weight: weightValue,
            bodyFat: bodyFatValue,
            bmi: bmiValue,
            leanBodyMass: leanBodyMassValue,
        });
    } catch (error) {
        console.error('[Health Weight] Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
