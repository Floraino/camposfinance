/**
 * Native Camera Service
 * Uses Capacitor Camera plugin on mobile, falls back to file input on web
 */

import { Camera, CameraResultType, CameraSource, Photo } from "@capacitor/camera";
import { isNativeApp } from "./platform";

export interface CapturedImage {
  base64: string;
  mimeType: string;
  webPath?: string;
}

/**
 * Request camera permissions on mobile
 */
export async function requestCameraPermissions(): Promise<boolean> {
  if (!isNativeApp()) {
    return true; // Web handles permissions via browser
  }

  try {
    const permissions = await Camera.requestPermissions({
      permissions: ["camera", "photos"],
    });

    return (
      permissions.camera === "granted" || permissions.camera === "limited"
    );
  } catch (error) {
    console.error("Error requesting camera permissions:", error);
    return false;
  }
}

/**
 * Check camera permissions status
 */
export async function checkCameraPermissions(): Promise<{
  camera: boolean;
  photos: boolean;
}> {
  if (!isNativeApp()) {
    return { camera: true, photos: true };
  }

  try {
    const permissions = await Camera.checkPermissions();
    return {
      camera:
        permissions.camera === "granted" || permissions.camera === "limited",
      photos:
        permissions.photos === "granted" || permissions.photos === "limited",
    };
  } catch {
    return { camera: false, photos: false };
  }
}

/**
 * Take a photo using the native camera
 */
export async function takePhoto(): Promise<CapturedImage | null> {
  if (!isNativeApp()) {
    return null; // Use file input on web
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });

    if (!photo.base64String) {
      throw new Error("No image data returned");
    }

    return {
      base64: photo.base64String,
      mimeType: `image/${photo.format || "jpeg"}`,
      webPath: photo.webPath,
    };
  } catch (error) {
    console.error("Error taking photo:", error);
    throw error;
  }
}

/**
 * Pick an image from the gallery
 */
export async function pickFromGallery(): Promise<CapturedImage | null> {
  if (!isNativeApp()) {
    return null; // Use file input on web
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
      correctOrientation: true,
    });

    if (!photo.base64String) {
      throw new Error("No image data returned");
    }

    return {
      base64: photo.base64String,
      mimeType: `image/${photo.format || "jpeg"}`,
      webPath: photo.webPath,
    };
  } catch (error) {
    console.error("Error picking from gallery:", error);
    throw error;
  }
}

/**
 * Pick an image from camera or gallery based on source
 */
export async function pickImage(
  source: "camera" | "gallery"
): Promise<CapturedImage | null> {
  // Check permissions first
  const hasPermission = await requestCameraPermissions();
  if (!hasPermission) {
    throw new Error("Camera permission denied");
  }

  if (source === "camera") {
    return takePhoto();
  } else {
    return pickFromGallery();
  }
}
