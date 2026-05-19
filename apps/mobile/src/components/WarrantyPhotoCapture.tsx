import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, spacing, radius, fonts, fontSize } from '@/theme';

/**
 * WarrantyPhotoCapture — camera button + thumbnail for warranty card photos.
 *
 * Uses react-native-vision-camera (already installed).
 * Photo is captured and stored as a local file URI.
 * Actual camera modal implementation deferred to when vision-camera
 * native modules are linked and running on device.
 *
 * For now, provides the UI shell and state management.
 */

interface WarrantyPhotoCaptureProps {
  photoUri: string | null;
  onCapture: (uri: string) => void;
  onClear: () => void;
}

export function WarrantyPhotoCapture({
  photoUri,
  onCapture,
  onClear,
}: WarrantyPhotoCaptureProps) {
  const handleCapture = useCallback(async () => {
    try {
      // Camera capture will be implemented when vision-camera is linked on device.
      // For now, show a placeholder alert.
      Alert.alert(
        'Warranty Card Photo',
        'Camera capture will open here on the tablet device.\n\nRequires react-native-vision-camera native module.',
      );
      // When implemented:
      // const camera = cameraRef.current;
      // const photo = await camera.takePhoto({ qualityPrioritization: 'balanced' });
      // onCapture(`file://${photo.path}`);
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Failed to capture photo');
    }
  }, [onCapture]);

  if (photoUri) {
    return (
      <View style={styles.thumbnailContainer}>
        <Image source={{ uri: photoUri }} style={styles.thumbnail} />
        <View style={styles.thumbnailActions}>
          <Pressable onPress={handleCapture} style={styles.retakeBtn}>
            <Text style={styles.retakeBtnText}>Retake</Text>
          </Pressable>
          <Pressable onPress={onClear} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={handleCapture} style={styles.captureBtn}>
      <Text style={styles.captureBtnIcon}>📷</Text>
      <Text style={styles.captureBtnText}>Warranty Card</Text>
    </Pressable>
  );
}

/**
 * Background upload service for warranty card photos.
 * Queues photos for upload after sale completion.
 */
export async function uploadWarrantyPhoto(
  saleId: string,
  serialNumber: string,
  photoUri: string,
  apiBaseUrl: string,
  token: string,
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('photo', {
      uri: photoUri,
      type: 'image/jpeg',
      name: `warranty-${serialNumber}.jpg`,
    } as any);
    formData.append('saleId', saleId);
    formData.append('serialNumber', serialNumber);

    const response = await fetch(`${apiBaseUrl}/inventory/serials/warranty-photo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    return response.ok;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderStyle: 'dashed',
  },
  captureBtnIcon: { fontSize: 14 },
  captureBtnText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
  },
  thumbnailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbnail: {
    width: 40,
    height: 30,
    borderRadius: radius.xs,
    backgroundColor: colors.bg.elevated,
  },
  thumbnailActions: {
    flexDirection: 'row',
    gap: 4,
  },
  retakeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.bg.elevated,
  },
  retakeBtnText: {
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  clearBtnText: {
    fontSize: fontSize.xs,
    color: colors.status.danger,
  },
});
