import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;

export interface LayoutInfo {
  /** True when window width >= 768dp */
  isTablet: boolean;
  /** Window width in dp */
  width: number;
  /** Window height in dp */
  height: number;
  /** Adaptive screen padding: 24dp tablet, 16dp phone */
  screenPadding: number;
  /** Adaptive card gap: 12dp tablet, 8dp phone */
  cardGap: number;
  /** Number of favorite tile columns: 6 tablet, 3 phone */
  favoriteColumns: number;
  /** Max favorites shown: 12 tablet, 6 phone */
  favoriteMax: number;
  /** Min touch target size: 56dp tablet, 52dp phone */
  touchMin: number;
}

/**
 * Reactive layout hook for tablet/phone adaptive UI.
 * Re-renders on dimension changes (rotation, split screen).
 */
export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  return {
    isTablet,
    width,
    height,
    screenPadding: isTablet ? 24 : 16,
    cardGap: isTablet ? 12 : 8,
    favoriteColumns: isTablet ? 6 : 3,
    favoriteMax: isTablet ? 12 : 6,
    touchMin: isTablet ? 56 : 52,
  };
}
