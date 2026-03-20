import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
  style?: ViewStyle;
}

export function Chip({ label, active, onPress, count, style }: ChipProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const displayText = count != null ? `${label} (${count.toLocaleString()})` : label;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          active ? styles.active : styles.inactive,
          style,
        ]}
      >
        <Text
          style={active ? styles.activeText : styles.inactiveText}
          numberOfLines={1}
        >
          {displayText}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  active: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginRight: 8,
  },
  inactive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginRight: 8,
  },
  activeText: {
    color: '#1A1A1A',
    fontSize: 13,
    fontFamily: 'Outfit-SemiBold',
    letterSpacing: 0.3,
  },
  inactiveText: {
    color: '#5A5750',
    fontSize: 13,
    fontFamily: 'Outfit-Medium',
    letterSpacing: 0.3,
  },
});
