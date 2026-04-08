import QuickLogClient from './QuickLogClient';

const MEAL_ICONS = {
  breakfast: '/breakfast.png',
  lunch: '/lunch.png',
  dinner: '/dinner.png',
  snack: '/snack.png',
};

const MEAL_TITLES = {
  breakfast: '朝食を記録',
  lunch: '昼食を記録',
  dinner: '夕食を記録',
  snack: '間食を記録',
};

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const type = params?.type || 'breakfast';
  const icon = MEAL_ICONS[type] || '/icon.png';
  const title = MEAL_TITLES[type] || 'クイック記録';

  return {
    title: `${title} | LifeLog`,
    icons: {
      icon: icon,
      apple: icon,
    },
  };
}

export default function QuickLogPage() {
  return <QuickLogClient />;
}
