/**
 * Native File Picker Service
 * Handles file selection on both mobile and web platforms
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { isNativeApp } from "./platform";

export interface PickedFile {
  name: string;
  content: string;
  mimeType: string;
  size: number;
}

/**
 * Read a file as text on mobile using Capacitor Filesystem
 * This is used for CSV imports
 */
export async function readFileAsText(uri: string): Promise<string> {
  if (!isNativeApp()) {
    throw new Error("Use FileReader API on web");
  }

  try {
    // For content:// URIs on Android or file:// on iOS
    const result = await Filesystem.readFile({
      path: uri,
    });

    // Result.data can be string (base64) or Blob
    if (typeof result.data === "string") {
      // Decode base64 to text
      const decoded = atob(result.data);
      // Handle UTF-8 encoding
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }

    // If it's a Blob, read it as text
    if (result.data instanceof Blob) {
      return await result.data.text();
    }

    throw new Error("Unexpected file data format");
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
}

/**
 * Create a file input element and trigger it
 * Works on both web and mobile webview
 */
export function createFileInput(
  accept: string,
  onSelect: (file: File) => void
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      onSelect(file);
    }
    // Clean up
    document.body.removeChild(input);
  };

  document.body.appendChild(input);
  return input;
}

/**
 * Pick a CSV file
 */
export function pickCSVFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = createFileInput(".csv,text/csv", (file) => {
      if (file.name.toLowerCase().endsWith(".csv")) {
        resolve(file);
      } else {
        reject(new Error("Please select a CSV file"));
      }
    });

    input.click();

    // Handle cancel
    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    }, 60000); // Clean up after 1 minute
  });
}

/**
 * Read CSV file content
 */
export async function readCSVFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      resolve(content);
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    // Try to detect encoding
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * Pick an image file
 */
export function pickImageFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = createFileInput("image/*", (file) => {
      if (file.type.startsWith("image/")) {
        resolve(file);
      } else {
        reject(new Error("Please select an image file"));
      }
    });

    input.click();
  });
}

/**
 * Read image as base64
 */
export async function readImageAsBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      // Remove data URL prefix to get pure base64
      const base64 = dataUrl.split(",")[1];
      resolve({
        base64,
        mimeType: file.type,
      });
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image"));
    };

    reader.readAsDataURL(file);
  });
}
