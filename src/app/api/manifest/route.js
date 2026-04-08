import { NextResponse } from 'next/server';

const MEAL_ICONS = {
  breakfast: '/breakfast.png',
  lunch: '/lunch.png',
  dinner: '/dinner.png',
  snack: '/snack.png',
};

const MEAL_NAMES = {
  breakfast: '朝食を記録',
  lunch: '昼食を記録',
  dinner: '夕食を記録',
  snack: '間食を記録',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'breakfast';
  const icon = MEAL_ICONS[type] || '/icon.png';
  const name = MEAL_NAMES[type] || 'クイック記録';

  const manifest = {
    id: `/quick?type=${type}`,
    name: `LifeLog - ${name}`,
    short_name: name,
    description: `${name} - LifeLog`,
    start_url: `/quick?type=${type}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F3F4F6',
    theme_color: '#10b981',
    lang: 'ja',
    icons: [
      {
        src: icon,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
}
