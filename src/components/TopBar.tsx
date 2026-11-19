import { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Moon,
  Plus,
  Send,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { MaintenanceAlertItem } from '../types/maintenance';
import { ALERT_THRESHOLD_OPTIONS, formatKm } from '../utils/maintenance';
import {
  formatAlertSummaryText,
  type BrowserPermissionState,
} from '../utils/notifications';
import type { ThemeMode } from '../utils/theme';

export type ActiveTab = 'overview' | 'trip' | 'fuel' | 'maintenance' | 'odometer';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAddFuel: () => void;
  onOpenAiAssistant: () => void;
  alerts: MaintenanceAlertItem[];
  unacknowledgedCount: number;
  dismissedAlertIds: string[];
  thresholdKm: number;
  browserEnabled: boolean;
  browserPermission: BrowserPermissionState;
  onChangeThresholdKm: (km: number) => void;
  onRequestBrowserPermission: () => Promise<void>;
  onToggleBrowserEnabled: (enabled: boolean) => void;
  onTestBrowserNotification: () => boolean;
  onDismissAlert: (alertId: string) => void;
  onRestoreDismissedAlerts: () => void;
  onJumpToSchedule: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'overview', label: 'ภาพรวมทั้งหมด' },
  { id: 'trip', label: 'คำนวณทริป' },
  { id: 'fuel', label: 'ประวัติเติมน้ำมัน' },
  { id: 'maintenance', label: 'ตารางซ่อมบำรุง' },
  { id: 'odometer', label: 'บันทึกเลขไมล์' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
  onOpenAddFuel,
  onOpenAiAssistant,
  alerts,
  unacknowledgedCount,
  dismissedAlertIds,
  thresholdKm,
  browserEnabled,
  browserPermission,
  onChangeThresholdKm,
  onRequestBrowserPermission,
  onToggleBrowserEnabled,
  onTestBrowserNotification,
  onDismissAlert,
  onRestoreDismissedAlerts,
  onJumpToSchedule,
}: TopBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [testStatusMsg, setTestStatusMsg] = useState<string | null>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        panelContainerRef.current &&
        !panelContainerRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [panelOpen]);

  const hasOverdue = alerts.some((a) => a.severity === 'overdue');
  const dismissedSet = new Set(dismissedAlertIds);
  const dismissedCount = alerts.filter((a) => dismissedSet.has(a.id)).length;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('overview');
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          อ้วนพี · Service Log
        </a>

        <nav aria-label="เมนูหลัก" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'border-blue-700 dark:border-blue-400 text-slate-900 dark:text-slate-100'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenAiAssistant}
            data-testid="open-ai-assistant-btn"
            aria-label="เปิดผู้ช่วย AI และสนทนาเสียงสด"
            className="inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-900 dark:text-blue-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Sparkles className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">ผู้ช่วย AI</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            data-testid="theme-toggle-btn"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={theme === 'dark' ? 'โหมดมืด (คลิกเพื่อใช้โหมดสว่าง)' : 'โหมดสว่าง (คลิกเพื่อใช้โหมดมืด)'}
            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
            )}
          </button>

          <div ref={panelContainerRef} className="relative">
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              aria-expanded={panelOpen}
              aria-haspopup="dialog"
              aria-label={`ศูนย์แจ้งเตือนซ่อมบำรุง (${alerts.length} รายการ)`}
              data-testid="notification-bell-btn"
              className={`relative inline-flex items-center justify-center min-w-[40px] min-h-[40px] px-2.5 rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                alerts.length > 0
                  ? hasOverdue
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
              {unacknowledgedCount > 0 ? (
                <span
                  data-testid="notification-badge-count"
                  className={`ml-1.5 font-mono text-xs font-semibold tabular-nums ${
                    hasOverdue
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-amber-900 dark:text-amber-300'
                  }`}
                >
                  {unacknowledgedCount}
                </span>
              ) : alerts.length > 0 ? (
                <span
                  data-testid="notification-badge-count"
                  className="ml-1.5 font-mono text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300"
                >
                  {alerts.length}
                </span>
              ) : null}
            </button>

            {panelOpen && (
              <div
                role="dialog"
                aria-label="ศูนย์แจ้งเตือนระยะซ่อมบำรุง"
                data-testid="notification-panel"
                className="absolute right-0 mt-2 w-[min(92vw,400px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      แจ้งเตือนรอบซ่อมบำรุง
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      เตือนอัตโนมัติเมื่อเลขไมล์เข้าใกล้กำหนดภายใน{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {formatKm(thresholdKm)} กม.
                      </span>
                    </p>
                  </div>
                  {dismissedCount > 0 && (
                    <button
                      type="button"
                      onClick={onRestoreDismissedAlerts}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
                    >
                      แสดงที่ซ่อน ({dismissedCount})
                    </button>
                  )}
                </div>

                {/* Alert threshold selector */}
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      ระยะแจ้งเตือนล่วงหน้า
                    </span>
                    <div
                      role="group"
                      aria-label="เลือกระยะแจ้งเตือนล่วงหน้า"
                      className="flex items-center gap-1 p-0.5 bg-slate-200/75 dark:bg-slate-800 rounded-lg"
                    >
                      {ALERT_THRESHOLD_OPTIONS.map((optKm) => {
                        const active = thresholdKm === optKm;
                        return (
                          <button
                            key={optKm}
                            type="button"
                            onClick={() => onChangeThresholdKm(optKm)}
                            data-testid={`threshold-opt-${optKm}`}
                            className={`px-2 py-1 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                              active
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                          >
                            {formatKm(optKm)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Browser Notification API controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                    {browserPermission === 'unsupported' ? (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <BellOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ Pop-up (ใช้แถบเตือนบนหน้าเว็บแทน)
                      </span>
                    ) : browserPermission === 'denied' ? (
                      <span className="text-[11px] text-amber-800 dark:text-amber-300">
                        เบราว์เซอร์บล็อกการแจ้งเตือนไว้ · อนุญาตได้ที่ไอคอนกุญแจข้าง URL
                      </span>
                    ) : browserPermission === 'default' ? (
                      <>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          แจ้งเตือนผ่านเบราว์เซอร์ (OS Alert)
                        </span>
                        <button
                          type="button"
                          onClick={onRequestBrowserPermission}
                          data-testid="enable-browser-notif-btn"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>เปิดอนุญาต</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={browserEnabled}
                            onChange={(e) => onToggleBrowserEnabled(e.target.checked)}
                            data-testid="toggle-browser-notif-checkbox"
                            className="rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600"
                          />
                          <span>แจ้งเตือนป๊อปอัปเบราว์เซอร์</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = onTestBrowserNotification();
                            setTestStatusMsg(
                              ok
                                ? 'ส่งแจ้งเตือนทดสอบแล้ว'
                                : 'กรุณาเปิดอนุญาตการแจ้งเตือนก่อน'
                            );
                            setTimeout(() => setTestStatusMsg(null), 2500);
                          }}
                          data-testid="test-browser-notif-btn"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Send className="w-3 h-3" aria-hidden="true" />
                          <span>ทดสอบ</span>
                        </button>
                      </>
                    )}
                  </div>
                  {testStatusMsg && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      {testStatusMsg}
                    </p>
                  )}
                </div>

                {/* Alert items */}
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {alerts.length === 0 ? (
                    <div className="p-6 text-center space-y-1.5">
                      <CheckCircle2
                        className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        ยังไม่มีรายการเข้าใกล้กำหนดซ่อม
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ทุกรายการยังมีระยะคงเหลือมากกว่า {formatKm(thresholdKm)} กม.
                      </p>
                    </div>
                  ) : (
                    alerts.map((alert) => {
                      const isOverdue = alert.severity === 'overdue';
                      const isDismissed = dismissedSet.has(alert.id);
                      const ItemIcon = isOverdue ? AlertOctagon : AlertTriangle;

                      return (
                        <div
                          key={alert.id}
                          data-testid={`notification-item-${alert.scheduleKey}`}
                          className={`p-3.5 space-y-2 ${
                            isDismissed
                              ? 'opacity-65 bg-slate-50/60 dark:bg-slate-800/40'
                              : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <ItemIcon
                                className={`w-4 h-4 mt-0.5 shrink-0 ${
                                  isOverdue
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {alert.title}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                  {formatAlertSummaryText(alert)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            {!isDismissed && (
                              <button
                                type="button"
                                onClick={() => onDismissAlert(alert.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Check className="w-3 h-3" aria-hidden="true" />
                                <span>รับทราบ</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPanelOpen(false);
                                onJumpToSchedule();
                              }}
                              className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-[11px] font-medium cursor-pointer"
                            >
                              ดูตารางซ่อม
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenAddFuel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white active:bg-slate-950 text-white dark:text-slate-900 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>บันทึกเติมน้ำมัน</span>
          </button>
        </div>
      </div>

      <nav
        aria-label="เมนูหลักบนมือถือ"
        className="md:hidden border-t border-slate-100 dark:border-slate-800 px-4 overflow-x-auto flex items-center gap-5"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-blue-700 dark:border-blue-400 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
