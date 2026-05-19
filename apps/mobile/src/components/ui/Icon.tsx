import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

export type IconName =
  | 'alert'
  | 'barcode'
  | 'card'
  | 'cart'
  | 'cash'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'customers'
  | 'hold'
  | 'info'
  | 'inventory'
  | 'location'
  | 'more'
  | 'package'
  | 'pos'
  | 'printer'
  | 'receipt'
  | 'search'
  | 'settings'
  | 'sync'
  | 'tag'
  | 'trash'
  | 'wifi';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const common = {
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({
  name,
  size = 20,
  color = colors.text.primary,
  strokeWidth = 2,
}: IconProps) {
  const stroke = color;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderIcon(name, stroke, strokeWidth)}
    </Svg>
  );
}

function renderIcon(name: IconName, stroke: string, strokeWidth: number) {
  switch (name) {
    case 'alert':
      return (
        <>
          <Path d="M12 4 3 20h18L12 4Z" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="12" y1="9" x2="12" y2="13" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="12" y1="17" x2="12.01" y2="17" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'barcode':
      return (
        <>
          <Line x1="5" y1="5" x2="5" y2="19" stroke={stroke} strokeWidth={strokeWidth + 1} {...common} />
          <Line x1="9" y1="5" x2="9" y2="19" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="13" y1="5" x2="13" y2="19" stroke={stroke} strokeWidth={strokeWidth + 1} {...common} />
          <Line x1="18" y1="5" x2="18" y2="19" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'card':
      return (
        <>
          <Rect x="3" y="6" width="18" height="12" rx="2" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="3" y1="10" x2="21" y2="10" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="7" y1="15" x2="10" y2="15" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'cart':
    case 'pos':
      return (
        <>
          <Circle cx="9" cy="20" r="1.5" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Circle cx="18" cy="20" r="1.5" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M3 4h2l2.2 11h10.7l2.1-7H7" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'cash':
      return (
        <>
          <Rect x="3" y="6" width="18" height="12" rx="2" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="6" y1="9" x2="6" y2="9.01" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="18" y1="15" x2="18" y2="15.01" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'check':
      return <Path d="m5 12 4 4L19 6" stroke={stroke} strokeWidth={strokeWidth} {...common} />;
    case 'chevron-down':
      return <Path d="m6 9 6 6 6-6" stroke={stroke} strokeWidth={strokeWidth} {...common} />;
    case 'chevron-left':
      return <Path d="m15 6-6 6 6 6" stroke={stroke} strokeWidth={strokeWidth} {...common} />;
    case 'chevron-right':
      return <Path d="m9 6 6 6-6 6" stroke={stroke} strokeWidth={strokeWidth} {...common} />;
    case 'close':
      return (
        <>
          <Line x1="6" y1="6" x2="18" y2="18" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="18" y1="6" x2="6" y2="18" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'customers':
      return (
        <>
          <Circle cx="9" cy="8" r="3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M3.5 20a5.5 5.5 0 0 1 11 0" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M15 11a3 3 0 0 0 0-6" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M17 20a4.5 4.5 0 0 0-2-3.7" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'hold':
      return (
        <>
          <Rect x="5" y="4" width="5" height="16" rx="1" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Rect x="14" y="4" width="5" height="16" rx="1" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'info':
      return (
        <>
          <Circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="12" y1="11" x2="12" y2="16" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="12" y1="8" x2="12.01" y2="8" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'inventory':
    case 'package':
      return (
        <>
          <Path d="M4 8 12 4l8 4-8 4-8-4Z" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M4 8v8l8 4 8-4V8" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M12 12v8" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'location':
      return (
        <>
          <Path d="M12 21s7-5.4 7-11a7 7 0 0 0-14 0c0 5.6 7 11 7 11Z" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Circle cx="12" cy="10" r="2.5" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'more':
      return (
        <>
          <Circle cx="5" cy="12" r="1.5" fill={stroke} />
          <Circle cx="12" cy="12" r="1.5" fill={stroke} />
          <Circle cx="19" cy="12" r="1.5" fill={stroke} />
        </>
      );
    case 'printer':
      return (
        <>
          <Path d="M7 8V4h10v4" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Rect x="5" y="13" width="14" height="7" rx="1" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M6 17H4a1 1 0 0 1-1-1v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a1 1 0 0 1-1 1h-2" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'receipt':
      return (
        <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm4 6h6M10 13h6" stroke={stroke} strokeWidth={strokeWidth} {...common} />
      );
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="6" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="16" y1="16" x2="21" y2="21" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M19 12a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8.6 8.6 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8.6 8.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5A7.8 7.8 0 0 0 5 12c0 .3 0 .7.1 1l-2 1.5 2 3.4 2.4-1a8.6 8.6 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8.6 8.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'sync':
      return (
        <>
          <Path d="M20 7h-6a5 5 0 0 0-4.6 3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="m17 4 3 3-3 3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M4 17h6a5 5 0 0 0 4.6-3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="m7 20-3-3 3-3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'tag':
      return (
        <>
          <Path d="M20 13 13 20 4 11V4h7l9 9Z" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Circle cx="8.5" cy="8.5" r="1.5" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4 7h16" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    case 'wifi':
      return (
        <>
          <Path d="M5 10a10 10 0 0 1 14 0" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M8 13a6 6 0 0 1 8 0" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Path d="M11 16a2 2 0 0 1 2 0" stroke={stroke} strokeWidth={strokeWidth} {...common} />
          <Line x1="12" y1="19" x2="12.01" y2="19" stroke={stroke} strokeWidth={strokeWidth} {...common} />
        </>
      );
    default:
      return null;
  }
}
