
/**
 * Utility functions for file handling and decompression
 */
import JSZip from "jszip";
import * as pako from "pako";

/**
 * Reads a file as text
 */
export const readAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

/**
 * Reads a file as ArrayBuffer
 */
export const readAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Decompresses a ZIP file and returns the content of the first log file
 */
export const decompressZip = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const zip = new JSZip();
    const zipContents = await zip.loadAsync(arrayBuffer);
    
    // Find the first .log or .txt file in the zip
    const logFiles = Object.keys(zipContents.files).filter(
      filename => filename.endsWith('.log') || filename.endsWith('.txt')
    );
    
    if (logFiles.length === 0) {
      throw new Error("No log files found in the ZIP archive");
    }
    
    // Use the first log file found
    const logFile = zipContents.files[logFiles[0]];
    const content = await logFile.async("string");
    
    return content;
  } catch (error) {
    console.error("Failed to decompress ZIP file:", error);
    throw new Error("Failed to extract log file from the ZIP archive. It may be corrupted or not a valid ZIP file.");
  }
};

/**
 * Decompresses a GZIP file and returns its content
 */
export const decompressGzip = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const compressed = new Uint8Array(arrayBuffer);
    const decompressed = pako.ungzip(compressed);
    
    // Convert Uint8Array to string
    const textDecoder = new TextDecoder('utf-8');
    return textDecoder.decode(decompressed);
  } catch (error) {
    console.error("Failed to decompress GZIP file:", error);
    throw new Error("Failed to decompress GZIP file. It may be corrupted or not a valid GZIP file.");
  }
};

/**
 * Determines if a file is a valid type for processing
 */
export const isValidFileType = (fileName: string): boolean => {
  const supportedExtensions = [".log", ".txt", ".zip", ".gz"];
  return supportedExtensions.some(ext => 
    fileName.toLowerCase().endsWith(ext)
  );
};
