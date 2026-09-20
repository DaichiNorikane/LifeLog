/**
 * Mock for lucide-react icons
 * Creates a mock component for each icon that renders a span with data-testid
 */
const createIconMock = (name) => {
  const Icon = (props) => {
    // Use React.createElement to avoid JSX in .js file
    const React = require('react');
    return React.createElement('span', { 'data-testid': `icon-${name}`, ...props });
  };
  Icon.displayName = name;
  return Icon;
};

// All icons used across the project
const iconNames = [
  'X', 'Plus', 'Trash2', 'Refrigerator', 'Sparkles', 'Trophy', 'AlertTriangle',
  'Info', 'Utensils', 'Loader2', 'Search', 'ArrowRight', 'Save', 'TrendingDown',
  'Calendar', 'Target', 'AlertCircle', 'Ruler', 'Camera', 'PenTool', 'Image',
  'ChevronRight', 'ChevronLeft', 'Clock', 'BookOpen', 'Minus', 'History',
  'Play', 'RotateCcw', 'Zap', 'Shield', 'XCircle', 'Calculator', 'Weight',
  'Flame', 'Activity', 'LogIn', 'Gamepad2', 'Brain', 'Bell', 'BellOff',
  'ThumbsUp', 'ThumbsDown', 'CheckCircle', 'RefreshCw',
  'ReferenceArea', 'ReferenceLine',
  'Moon', 'Settings2', 'Check', 'Coffee', 'TrendingUp',
  'ChevronDown', 'ChevronUp', 'Dumbbell', 'Footprints', 'Scale',
  // ProjectorSimulator
  'Projector', 'MoveVertical', 'Sun', 'Eye', 'Monitor',
  'ArrowLeftRight', 'Lightbulb', 'Maximize2',
];

const mocks = {};
iconNames.forEach(name => {
  mocks[name] = createIconMock(name);
});

module.exports = mocks;
