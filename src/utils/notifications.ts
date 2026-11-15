import type {
  MaintenanceAlertItem,
  NotificationPreferences,
} from '../types/maintenance';
import { DEFAULT_ALERT_THRESHOLD_KM, formatKm } from './maintenance';

const PREFS_STORAGE_KEY = 'ouanpee_triton_notification_prefs_v1';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  thresholdKm: DEFAULT_ALERT_THRESHOLD_KM,
  browserEnabled: true,
  dismissedAlertIds: [],
  sentBrowserKeys: [],
};

export type BrowserPermissionState = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      thresholdKm:
        typeof parsed.thresholdKm === 'number' && parsed.thresholdKm > 0
          ? parsed.thresholdKm
          : DEFAULT_ALERT_THRESHOLD_KM,
      browserEnabled:
        typeof parsed.browserEnabled === 'boolean' ? parsed.browserEnabled : true,
      dismissedAlertIds: Array.isArray(parsed.dismissedAlertIds)
        ? parsed.dismissedAlertIds.filter((v): v is string => typeof v === 'string')
        : [],
      sentBrowserKeys: Array.isArray(parsed.sentBrowserKeys)
        ? parsed.sentBrowserKeys.filter((v): v is string => typeof v === 'string')
        : [],
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        // Cap persisted history arrays cleanly
        dismissedAlertIds: prefs.dismissedAlertIds.slice(-40),
        sentBrowserKeys: prefs.sentBrowserKeys.slice(-40),
      })
    );
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function formatAlertSummaryText(alert: MaintenanceAlertItem): string {
  if (alert.severity === 'overdue') {
    const overKm = Math.abs(alert.remainingKm);
    return overKm === 0
      ? `ถึงกำหนดเปลี่ยนที่ ${formatKm(alert.nextDueKm)} กม. แล้ว (ไมล์ปัจจุบัน ${formatKm(alert.currentOdometer)} กม.)`
      : `เกินกำหนดระยะเปลี่ยนแล้ว ${formatKm(overKm)} กม. (ครบกำหนด ${formatKm(alert.nextDueKm)} กม.)`;
  }
  return `เหลืออีก ${formatKm(alert.remainingKm)} กม. จะครบกำหนด ${formatKm(alert.nextDueKm)} กม. (ไมล์ปัจจุบัน ${formatKm(alert.currentOdometer)} กม.)`;
}

export function dispatchBrowserMaintenanceNotifications(
  alerts: MaintenanceAlertItem[],
  alreadySentKeys: string[]
): string[] {
  if (getBrowserNotificationPermission() !== 'granted' || alerts.length === 0) {
    return alreadySentKeys;
  }

  const sentSet = new Set(alreadySentKeys);
  const newlySent: string[] = [];

  for (const alert of alerts) {
    if (sentSet.has(alert.id)) continue;
    sentSet.add(alert.id);
    newlySent.push(alert.id);

    const title =
      alert.severity === 'overdue'
        ? `ถึงกำหนดซ่อมบำรุง: ${alert.title}`
        : `ใกล้ถึงรอบซ่อมบำรุง: ${alert.title}`;
    const body = formatAlertSummaryText(alert);

    try {
      const notification = new window.Notification(title, {
        body,
        tag: `ouanpee-maint-${alert.scheduleKey}-${alert.serviceId}`,
        requireInteraction: alert.severity === 'overdue',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Ignore environments that restrict Notification constructor
    }
  }

  if (newlySent.length === 0) return alreadySentKeys;
  return Array.from(sentSet).slice(-40);
}

export function sendTestBrowserNotification(
  alerts: MaintenanceAlertItem[],
  thresholdKm: number
): boolean {
  if (getBrowserNotificationPermission() !== 'granted') {
    return false;
  }
  const urgent = alerts[0];
  const title = urgent
    ? `${urgent.severity === 'overdue' ? 'ถึงกำหนด' : 'ใกล้ถึงรอบ'}: ${urgent.title}`
    : 'ระบบแจ้งเตือนซ่อมบำรุงอ้วนพี พร้อมทำงาน';
  const body = urgent
    ? formatAlertSummaryText(urgent)
    : `จะแจ้งเตือนอัตโนมัติเมื่อเลขไมล์เข้าใกล้กำหนดซ่อมบำรุงภายใน ${formatKm(thresholdKm)} กม.`;

  try {
    const notification = new window.Notification(title, {
      body,
      tag: 'ouanpee-maint-test',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
