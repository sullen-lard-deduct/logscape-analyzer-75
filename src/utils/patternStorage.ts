
import { RegexPattern } from "@/components/regex/RegexManager";

const DB_NAME = 'LogVision';
const STORE_NAME = 'RegexPatterns';
const DB_VERSION = 1;

// Helper to open the IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      reject(new Error('Error opening database'));
    };
    
    request.onsuccess = (event) => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Save patterns to IndexedDB
export const savePatterns = async (patterns: RegexPattern[]): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Clear existing patterns
    store.clear();
    
    // Add each pattern
    for (const pattern of patterns) {
      store.add(pattern);
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      
      transaction.onerror = (event) => {
        console.error('Transaction error:', event);
        reject(new Error('Failed to save patterns'));
      };
    });
  } catch (error) {
    console.error('Error saving patterns:', error);
    throw error;
  }
};

// Load patterns from IndexedDB
export const loadPatterns = async (): Promise<RegexPattern[]> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        db.close();
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        reject(new Error('Failed to load patterns'));
      };
    });
  } catch (error) {
    console.error('Error loading patterns:', error);
    return [];
  }
};
