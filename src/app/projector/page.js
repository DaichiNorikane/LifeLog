import ProjectorSimulator from '@/components/ProjectorSimulator';

export const metadata = {
  title: '投写シミュレーター | LifeLog',
  description: 'プロジェクターのレンズ・投写距離・設置高さから、画面サイズやレンズシフト量、明るさをシミュレーションします。',
};

export default function ProjectorPage() {
  return <ProjectorSimulator />;
}
