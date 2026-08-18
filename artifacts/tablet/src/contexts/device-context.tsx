import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  TabletContext as ApiTabletContext,
  TodayItem,
} from "@workspace/api-client-react";
import {
  initDeviceAuth,
  getStoredToken,
  clearToken,
  fetchDeviceContext,
  fetchTodayItems,
} from "@/lib/device-api";
import { getStrings, getGreeting, type Strings } from "@/lib/i18n";

export type AppState = "loading" | "setup" | "home";
export type CompanionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "dnd"
  | "offline";

interface DeviceContextValue {
  appState: AppState;
  ctx: ApiTabletContext | null;
  todayItems: TodayItem[];
  companionState: CompanionState;
  isOnline: boolean;
  t: Strings;
  greeting: string;
  /** Called after a successful setup — reloads context. */
  onSetupComplete: () => void;
  /** Cycle through idle → listening → thinking → speaking → idle on demand. */
  activateConversation: () => void;
}

const DeviceCtx = createContext<DeviceContextValue | null>(null);

// DND check — handles overnight (endTime < startTime)
function isDndActive(dnd: ApiTabletContext["dnd"] | undefined | null): boolean {
  if (!dnd || !dnd.isActive) return false;
  const now = new Date();
  const [sh, sm] = dnd.startTime.split(":").map(Number);
  const [eh, em] = dnd.endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (endMins < startMins) {
    // Overnight DND — e.g. 22:00–08:00
    return nowMins >= startMins || nowMins < endMins;
  }
  return nowMins >= startMins && nowMins < endMins;
}

// Conversation sequence timing (ms)
const SEQ: [CompanionState, number][] = [
  ["listening", 3000],
  ["thinking", 2500],
  ["speaking", 3500],
  ["idle", 0],
];

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>("loading");
  const [ctx, setCtx] = useState<ApiTabletContext | null>(null);
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [companionState, setCompanionState] =
    useState<CompanionState>("idle");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const seqTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init: configure auth and attempt to validate any stored token
  useEffect(() => {
    initDeviceAuth();

    const token = getStoredToken();
    if (!token) {
      setAppState("setup");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchDeviceContext();
        if (cancelled) return;
        if (!result) {
          setAppState("setup");
          return;
        }
        setCtx(result);
        setAppState("home");
        const { items } = await fetchTodayItems();
        if (!cancelled) setTodayItems(items);
      } catch {
        if (!cancelled) setAppState("setup");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Reflect DND state in companionState whenever ctx changes
  useEffect(() => {
    if (appState !== "home" || !ctx) return;
    if (isDndActive(ctx.dnd) && companionState === "idle") {
      setCompanionState("dnd");
    } else if (!isDndActive(ctx.dnd) && companionState === "dnd") {
      setCompanionState("idle");
    }
  }, [ctx, appState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Online / offline events
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const onSetupComplete = useCallback(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchDeviceContext();
      if (cancelled || !result) return;
      setCtx(result);
      setAppState("home");
      const { items } = await fetchTodayItems();
      if (!cancelled) setTodayItems(items);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activateConversation = useCallback(() => {
    if (companionState !== "idle") return;
    if (seqTimer.current) clearTimeout(seqTimer.current);

    let step = 0;
    const advance = () => {
      const [state, delay] = SEQ[step];
      setCompanionState(state);
      if (delay > 0) {
        seqTimer.current = setTimeout(() => {
          step++;
          advance();
        }, delay);
      }
    };
    advance();
  }, [companionState]);

  const lang = ctx?.user?.language;
  const t = getStrings(lang);
  const name =
    ctx?.user?.preferredFormOfAddress ||
    ctx?.user?.firstName ||
    ctx?.user?.displayName ||
    "";
  const greeting = ctx ? getGreeting(lang, name) : "";

  return (
    <DeviceCtx.Provider
      value={{
        appState,
        ctx,
        todayItems,
        companionState,
        isOnline,
        t,
        greeting,
        onSetupComplete,
        activateConversation,
      }}
    >
      {children}
    </DeviceCtx.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceCtx);
  if (!ctx) throw new Error("useDevice must be used inside DeviceProvider");
  return ctx;
}
