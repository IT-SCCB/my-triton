/**
 * ตัวกลางเรียก Express /api/* ของเซิร์ฟเวอร์หลังบ้าน
 * ในโหมด GitHub Pages (VITE_PAGES_BUILD=true) ไม่มีเซิร์ฟเวอร์หลังบ้าน
 * apiFetch จะโยน ServerUnavailableError ทันทีโดยไม่ยิงเครือข่าย
 * เพื่อให้ฝั่ง UI fallback ไปทำงานผ่าน Firestore / localStorage ได้ตามปกติ
 */
export const STATIC_MODE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_PAGES_BUILD === 'true';

export class ServerUnavailableError extends Error {
  constructor() {
    super('ไม่มีเซิร์ฟเวอร์หลังบ้านในโหมด GitHub Pages');
    this.name = 'ServerUnavailableError';
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (STATIC_MODE) {
    throw new ServerUnavailableError();
  }
  try {
    return await fetch(path, init);
  } catch {
    throw new ServerUnavailableError();
  }
}
