/**
 * serverApi — ตัวกลางเรียก Express /api/* ของเซิร์ฟเวอร์หลังบ้าน
 *
 * โหมด GitHub Pages (VITE_PAGES_BUILD=true ตอน build) ไม่มีเซิร์ฟเวอร์หลังบ้าน
 * apiFetch จะโยน ServerUnavailableError ทันทีโดยไม่ยิงเครือข่ายเลย
 * เพื่อให้โค้ดฝั่ง UI ที่เรียก /api/* แล้วมี fallback บันทึกลง localStorage
 * ทำงานต่อได้เหมือนเดิม ส่วนโหมดเซิร์ฟเวอร์ (AI Studio / Cloud Run)
 * พฤติกรรมไม่เปลี่ยนอะไรเลย
 */

export const STATIC_MODE = import.meta.env.VITE_PAGES_BUILD === 'true';

export class ServerUnavailableError extends Error {
  constructor() {
    super('ไม่มีเซิร์ฟเวอร์หลังบ้านในโหมด GitHub Pages');
    this.name = 'ServerUnavailableError';
  }
}

/**
 * เรียก /api/* เหมือน fetch ปกติ แต่:
 * - โหมด static: โยน ServerUnavailableError ทันที (ไม่ยิงเครือข่าย)
 * - เซิร์ฟเวอร์ล่ม/ติดต่อไม่ได้: โยน ServerUnavailableError แทน TypeError ของ fetch
 * ผู้เรียกจับ error แล้วบันทึกลงเครื่อง (localStorage) ต่อได้ตามปกติ
 */
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
