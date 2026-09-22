import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, RefreshCw, Settings, X } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  waitForTradingViewChart,
  type HeaderMode,
} from '@/trading-view-chart';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function SimulatorPage() {
  const previewRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const chartCleanupRef = useRef<(() => void) | undefined>(undefined);
  const dragMovedRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    scale: number;
    buttonWidth: number;
    buttonHeight: number;
  } | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [headerMode, setHeaderMode] = useState<HeaderMode>('demo');
  const [desktopScale, setDesktopScale] = useState(1);
  const [floatingPosition, setFloatingPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const iframeSrc = `${import.meta.env.BASE_URL}quick-swap-simulator.html`;

  const refreshSimulator = () => {
    setIsLoading(true);
    setHasError(false);
    setFrameKey((current) => current + 1);
  };

  const openSimulator = () => {
    window.open(iframeSrc, '_blank', 'noopener,noreferrer');
  };

  const startDraggingSettings = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const device = deviceRef.current;
    if (!device || (event.pointerType === 'mouse' && event.button !== 0)) return;

    event.preventDefault();
    const deviceRect = device.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const scale = deviceRect.width / Math.max(1, device.offsetWidth);
    const buttonWidth = buttonRect.width / scale;
    const buttonHeight = buttonRect.height / scale;
    const startLeft =
      floatingPosition?.left ??
      device.clientWidth - buttonWidth - 16;
    const startTop =
      floatingPosition?.top ??
      device.clientHeight - buttonHeight - 92;

    dragMovedRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft,
      startTop,
      scale,
      buttonWidth,
      buttonHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSettings = (event: React.PointerEvent<HTMLButtonElement>) => {
    const device = deviceRef.current;
    const drag = dragStateRef.current;
    if (!device || !drag || event.pointerId !== drag.pointerId) return;

    const deltaX = (event.clientX - drag.startX) / drag.scale;
    const deltaY = (event.clientY - drag.startY) / drag.scale;
    if (!dragMovedRef.current && Math.hypot(deltaX, deltaY) <= 8) return;

    dragMovedRef.current = true;
    const maxLeft = Math.max(8, device.clientWidth - drag.buttonWidth - 8);
    const maxTop = Math.max(8, device.clientHeight - drag.buttonHeight - 8);
    setFloatingPosition({
      left: Math.min(Math.max(8, drag.startLeft + deltaX), maxLeft),
      top: Math.min(Math.max(8, drag.startTop + deltaY), maxTop),
    });
  };

  const stopDraggingSettings = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const toggleSettings = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    setSettingsOpen((open) => !open);
  };

  useEffect(
    () => () => {
      chartCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (isLoading) return;
    frameRef.current?.contentWindow?.postMessage(
      { type: 'quick-swap-header-mode', mode: headerMode },
      '*',
    );
  }, [headerMode, isLoading]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const updateScale = () => {
      const preview = previewRef.current;
      const stage = stageRef.current;

      if (!preview || !stage || !mediaQuery.matches) {
        setDesktopScale(1);
        return;
      }

      const viewportHeight =
        window.visualViewport?.height || window.innerHeight;
      const viewportWidth = preview.clientWidth || window.innerWidth;
      const desktopPadding = 32;
      const availableHeight = Math.max(1, viewportHeight - desktopPadding);
      const availableWidth = Math.max(1, viewportWidth - desktopPadding);
      const naturalStageHeight = Math.max(1, stage.scrollHeight);
      const naturalStageWidth = Math.max(1, stage.scrollWidth);
      setDesktopScale(() =>
        Math.min(
          1,
          availableHeight / naturalStageHeight,
          availableWidth / naturalStageWidth,
        ),
      );
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    if (previewRef.current) resizeObserver.observe(previewRef.current);
    if (stageRef.current) resizeObserver.observe(stageRef.current);
    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);
    mediaQuery.addEventListener('change', updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
      window.visualViewport?.removeEventListener('resize', updateScale);
      mediaQuery.removeEventListener('change', updateScale);
    };
  }, []);

  return (
    <main
      ref={previewRef}
      className="min-h-[100dvh] overflow-x-hidden bg-[#000] flex flex-col items-center justify-center relative font-sans sm:h-[100dvh] sm:min-h-0 sm:justify-start sm:overflow-hidden sm:py-4"
    >
      
      {/* Subtle background glow for desktop presentation */}
      <div className="hidden absolute inset-0 overflow-hidden pointer-events-none selection:bg-transparent">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-primary/5 to-accent/5 rounded-full blur-3xl opacity-50" />
      </div>

      <div
        ref={stageRef}
        className="relative z-10 flex flex-col items-center gap-8 w-full sm:w-auto h-[100dvh] sm:h-auto"
        style={{
          transform: `scale(${desktopScale})`,
          transformOrigin: 'center top',
        }}
      >
        
        {/* Device Container */}
        <div
          ref={deviceRef}
          className="relative w-full h-full sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:border-[14px] sm:border-black bg-black overflow-hidden sm:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_60px_rgba(0,0,0,0.6)] flex flex-col"
        >
          
          {isLoading && !hasError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black space-y-4">
               <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
            </div>
          )}

          {hasError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <RefreshCw className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Simulator Unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Could not load the interactive experience.
              </p>
              <button
                type="button"
                onClick={refreshSimulator}
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Try Again
              </button>
            </div>
          ) : (
            <iframe
              key={frameKey}
              ref={frameRef}
              src={iframeSrc}
              title="Quick Swap Simulator"
              className={`flex-1 w-full border-0 bg-black transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => {
                setIsLoading(false);
                chartCleanupRef.current?.();
                chartCleanupRef.current = waitForTradingViewChart(
                  frameRef.current!,
                  headerMode,
                );
              }}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              allow="clipboard-write; clipboard-read"
            />
          )}

          <button
            type="button"
            aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
            aria-expanded={settingsOpen}
            onPointerDown={startDraggingSettings}
            onPointerMove={moveSettings}
            onPointerUp={stopDraggingSettings}
            onPointerCancel={stopDraggingSettings}
            onClick={toggleSettings}
            className="absolute z-30 flex h-11 w-11 touch-none select-none items-center justify-center rounded-full border border-white/15 bg-[#202225]/95 text-[#BAF24A] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur transition-colors duration-150 hover:bg-[#2a2d30] focus:outline-none focus:ring-2 focus:ring-[#BAF24A]/70"
            style={
              floatingPosition
                ? {
                    left: floatingPosition.left,
                    top: floatingPosition.top,
                  }
                : { right: 16, bottom: 92 }
            }
          >
            {settingsOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Settings className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          {settingsOpen && (
            <div
              role="dialog"
              aria-label="Settings"
              className="absolute z-20 w-[250px] rounded-2xl border border-white/10 bg-[#1b1d1f]/[.98] p-4 text-white shadow-[0_16px_40px_rgba(0,0,0,0.48)] backdrop-blur"
              style={
                floatingPosition
                  ? {
                      left: Math.min(
                        floatingPosition.left,
                        Math.max(8, (deviceRef.current?.clientWidth ?? 390) - 258),
                      ),
                      top: Math.max(8, floatingPosition.top - 116),
                    }
                  : { right: 12, bottom: 148 }
              }
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Settings</h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                  className="rounded-full p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4">
                <p className="text-xs font-medium text-neutral-400">Header</p>
                <div
                  role="group"
                  aria-label="Header style"
                  className="mt-2 grid grid-cols-2 rounded-xl bg-[#111315] p-1"
                >
                  {([
                    ['demo', 'Demo header'],
                    ['condensed', 'Condensed'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={headerMode === mode}
                      onClick={() => setHeaderMode(mode)}
                      className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                        headerMode === mode
                          ? 'bg-[#34373a] text-white shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Subtle controls outside the device on desktop */}
        <div className="hidden sm:flex items-center gap-4 text-neutral-400">
          <button
            onClick={refreshSimulator}
            className="p-3 rounded-full bg-[#121212] hover:bg-[#1a1a1a] hover:text-white border border-white/5 transition-colors group relative"
            aria-label="Restart Simulator"
          >
            <RefreshCw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#1a1a1a] border border-white/10 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
              Restart
            </span>
          </button>
          
          <button
            onClick={openSimulator}
            className="p-3 rounded-full bg-[#121212] hover:bg-[#1a1a1a] hover:text-white border border-white/5 transition-colors group relative"
            aria-label="Open in new tab"
          >
            <ExternalLink className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[#1a1a1a] border border-white/10 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
              Open external
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={SimulatorPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
