import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, RefreshCw, Settings, X } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type CandlestickData,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import starsAsset from '@assets/Stars_1789482066898.png';

const queryClient = new QueryClient();
type HeaderMode = 'demo' | 'condensed';

const sourceValues = [
  20, 25, 30, 38, 50, 42, 58, 70, 82, 72, 88, 80, 60, 50, 38, 50, 42,
  30, 20, 28, 22, 34, 28, 42, 36, 46, 38, 30, 22, 14, 26, 30, 42, 36,
  50, 44, 56, 72, 80, 70, 78, 60, 52, 64, 58, 70, 64, 80, 76, 86, 78,
  84, 74, 80, 70, 62, 54, 60, 56, 64,
];

function buildChartData() {
  const startTime = 1_755_820_800 as UTCTimestamp;
  const priceScale = 75.8 / 64;
  const closes = sourceValues.map((value) => 2180 + value * priceScale);

  const lineData: LineData<UTCTimestamp>[] = closes.map((value, index) => ({
    time: (startTime + index * 300) as UTCTimestamp,
    value: Number(value.toFixed(2)),
  }));

  const candleData: CandlestickData<UTCTimestamp>[] = closes.map(
    (close, index) => {
      const open = index === 0 ? close - 4.2 : closes[index - 1];
      const wick = 2.5 + (index % 4) * 0.85;
      return {
        time: (startTime + index * 300) as UTCTimestamp,
        open: Number(open.toFixed(2)),
        high: Number((Math.max(open, close) + wick).toFixed(2)),
        low: Number((Math.min(open, close) - wick * 0.8).toFixed(2)),
        close: Number(close.toFixed(2)),
      };
    },
  );

  return { lineData, candleData };
}

function installTradingViewChart(
  frame: HTMLIFrameElement,
  initialHeaderMode: HeaderMode = 'demo',
) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return;

  const originalChart = frameDocument.querySelector<SVGElement>(
    'svg[viewBox="0 0 360 240"]',
  );
  const chartRegion = originalChart?.parentElement;
  if (!chartRegion || chartRegion.dataset.tradingViewChart === 'ready') return;

  const headerPrice = Array.from(
    frameDocument.querySelectorAll<HTMLElement>('div'),
  ).find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim() === '$2,255.80',
  );
  const timeSelector = chartRegion.nextElementSibling as HTMLElement | null;
  const timeSelectorButtons = timeSelector?.querySelectorAll('button');
  const chartModeButton = timeSelectorButtons?.item(
    (timeSelectorButtons.length ?? 1) - 1,
  );
  const originalChartIcon = chartModeButton
    ? Array.from(chartModeButton.childNodes).map((node) => node.cloneNode(true))
    : [];
  const actionMenu = timeSelector?.nextElementSibling as HTMLElement | null;
  const moreButton = actionMenu
    ? Array.from(actionMenu.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.includes('More'),
      )
    : undefined;
  const originalMoreChildren = moreButton
    ? Array.from(moreButton.childNodes).map((node) => node.cloneNode(true))
    : [];
  const addedPositionNodes: Node[] = [];
  const ethereumIcon = frameDocument.querySelector<HTMLImageElement>(
    'img[alt="ETH"]',
  );
  const backIcon = frameDocument.querySelector<HTMLImageElement>(
    'img[alt="back"]',
  );
  const topHeader = backIcon?.closest<HTMLElement>('div.relative');
  const tokenHeaderRow = ethereumIcon?.parentElement as HTMLElement | null;
  const topHeaderCenter = topHeader
    ? Array.from(topHeader.children).find((child) =>
        child.classList.contains('absolute'),
      ) as HTMLElement | undefined
    : undefined;
  let copyToastTimer: number | undefined;
  const makeText = (
    text: string,
    styles: Partial<CSSStyleDeclaration> = {},
  ) => {
    const element = frameDocument.createElement('div');
    element.textContent = text;
    Object.assign(element.style, styles);
    return element;
  };
  const makeMaterialIcon = (
    name: string,
    size: number,
    color: string,
  ) => {
    const paths: Record<string, string> = {
      auto_awesome:
        'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9ZM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15ZM11.5 9.5 9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5Z',
      chevron_right:
        'M9.29 6.71a.996.996 0 0 0 0 1.41L13.17 12l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L10.7 6.7a.996.996 0 0 0-1.41.01Z',
      chevron_left:
        'm14.71 6.71a.996.996 0 0 1 0 1.41L10.83 12l3.88 3.88a.996.996 0 1 1-1.41 1.41l-4.59-4.59a.996.996 0 0 1 0-1.41L13.3 6.7a.996.996 0 0 1 1.41.01Z',
      close:
        'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.3 19.7 2.89 18.29 9.17 12 2.89 5.71 4.3 4.3l6.29 6.29 6.29-6.29 1.42 1.41Z',
      thumb_down:
        'M15 3H6c-.83 0-1.54.5-1.84 1.22L1 11.5V13h6.31L6.47 17.84A2 2 0 0 0 8.4 20c.5 0 .98-.2 1.33-.55L15 14.18V21h4V3h-4Zm-2 10.33-4.67 5.12a.4.4 0 0 1-.28.12.4.4 0 0 1-.39-.48L9 12H3.62l2.36-6H13v7.33ZM17 19h-1V5h1v14Z',
      thumb_up:
        'M9 21h9c.83 0 1.54-.5 1.84-1.22L23 12.5V11h-6.31l.84-4.84A2 2 0 0 0 15.6 4c-.5 0-.98.2-1.33.55L9 9.82V3H5v18h4Zm2-10.33 4.67-5.12a.4.4 0 0 1 .28-.12.4.4 0 0 1 .39.48L15 12h5.38l-2.36 6H11v-7.33ZM7 5h1v14H7V5Z',
      content_copy:
        'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z',
      info_outline:
        'M11 17h2v-6h-2v6Zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8ZM11 9h2V7h-2v2Z',
    };
    const icon = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', `${size}`);
    icon.setAttribute('height', `${size}`);
    icon.setAttribute('fill', 'currentColor');
    icon.setAttribute('aria-hidden', 'true');
    Object.assign(icon.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: `${size}px`,
      height: `${size}px`,
      color,
      fontSize: `${size}px`,
      lineHeight: `${size}px`,
    });
    const path = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );
    path.setAttribute('d', paths[name] ?? paths.info_outline);
    path.setAttribute('fill', color);
    icon.append(path);
    return icon;
  };
  const condensedAddress = '0x12C7e...q135f';
  const originalTokenHeaderDisplay = tokenHeaderRow?.style.display ?? '';
  const originalTopHeaderCenterDisplay = topHeaderCenter?.style.display ?? '';
  const condensedHeader = frameDocument.createElement('div');
  Object.assign(condensedHeader.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '52px',
    right: '92px',
    display: 'none',
    alignItems: 'center',
    minWidth: '0',
    gap: '10px',
    pointerEvents: 'auto',
  });

  const condensedTokenIcon = ethereumIcon?.cloneNode(true) as HTMLImageElement | null;
  if (condensedTokenIcon) {
    condensedTokenIcon.removeAttribute('alt');
    Object.assign(condensedTokenIcon.style, {
      width: '40px',
      height: '40px',
      flex: '0 0 40px',
      objectFit: 'contain',
    });
    condensedHeader.append(condensedTokenIcon);
  }

  const condensedCopy = frameDocument.createElement('div');
  Object.assign(condensedCopy.style, {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    gap: '2px',
  });
  condensedCopy.append(
    makeText('Ethereum', {
      color: '#fff',
      fontSize: '16px',
      fontWeight: '600',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
    }),
  );
  const addressRow = frameDocument.createElement('div');
  Object.assign(addressRow.style, {
    display: 'flex',
    alignItems: 'center',
    minWidth: '0',
    gap: '4px',
  });
  addressRow.append(
    makeText(condensedAddress, {
      color: '#9B9B9B',
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }),
  );
  const copyButton = frameDocument.createElement('button');
  copyButton.type = 'button';
  copyButton.setAttribute('aria-label', 'Copy token address');
  Object.assign(copyButton.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: '0',
    border: '0',
    borderRadius: '8px',
    background: 'transparent',
    color: '#9B9B9B',
    cursor: 'pointer',
  });
  copyButton.append(makeMaterialIcon('content_copy', 16, '#9B9B9B'));
  addressRow.append(copyButton);
  condensedCopy.append(addressRow);
  condensedHeader.append(condensedCopy);

  const copyToast = frameDocument.createElement('div');
  copyToast.textContent = 'Address copied';
  Object.assign(copyToast.style, {
    position: 'fixed',
    zIndex: '100',
    top: '16px',
    left: '50%',
    padding: '10px 14px',
    borderRadius: '999px',
    background: '#fff',
    color: '#131416',
    fontFamily: 'Geist, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '20px',
    opacity: '0',
    pointerEvents: 'none',
    transform: 'translate(-50%, -140%)',
    transition: 'transform 220ms ease, opacity 180ms ease',
  });
  frameDocument.body.append(copyToast);

  const showCopyToast = () => {
    if (copyToastTimer !== undefined) {
      frameDocument.defaultView?.clearTimeout(copyToastTimer);
    }
    copyToast.style.opacity = '1';
    copyToast.style.transform = 'translate(-50%, 0)';
    copyToastTimer = frameDocument.defaultView?.setTimeout(() => {
      copyToast.style.opacity = '0';
      copyToast.style.transform = 'translate(-50%, -140%)';
    }, 2200);
  };

  const copyAddress = async () => {
    let copied = false;
    try {
      await frameDocument.defaultView?.navigator.clipboard.writeText(
        condensedAddress,
      );
      copied = true;
    } catch {
      const fallbackInput = frameDocument.createElement('textarea');
      fallbackInput.value = condensedAddress;
      Object.assign(fallbackInput.style, {
        position: 'fixed',
        opacity: '0',
        pointerEvents: 'none',
      });
      frameDocument.body.append(fallbackInput);
      fallbackInput.select();
      copied = frameDocument.execCommand('copy');
      fallbackInput.remove();
    }
    if (copied) showCopyToast();
  };
  copyButton.addEventListener('click', copyAddress);

  if (topHeader) topHeader.append(condensedHeader);
  const applyHeaderMode = (mode: HeaderMode) => {
    const isCondensed = mode === 'condensed';
    condensedHeader.style.display = isCondensed ? 'flex' : 'none';
    if (topHeaderCenter) {
      topHeaderCenter.style.display = isCondensed
        ? 'none'
        : originalTopHeaderCenterDisplay;
    }
    if (tokenHeaderRow) {
      tokenHeaderRow.style.display = isCondensed
        ? 'none'
        : originalTokenHeaderDisplay;
    }
  };
  const handleHeaderModeMessage = (event: MessageEvent) => {
    if (
      event.data?.type === 'quick-swap-header-mode' &&
      (event.data.mode === 'demo' || event.data.mode === 'condensed')
    ) {
      applyHeaderMode(event.data.mode);
    }
  };
  frameDocument.defaultView?.addEventListener(
    'message',
    handleHeaderModeMessage,
  );
  applyHeaderMode(initialHeaderMode);
  const makeDivider = () => {
    const divider = frameDocument.createElement('div');
    divider.className = 'mt-6';
    Object.assign(divider.style, {
      width: '100vw',
      marginLeft: 'calc(50% - 50vw)',
      borderTop: '1px solid rgba(180,180,181,0.20)',
    });
    addedPositionNodes.push(divider);
    return divider;
  };
  const makeEthereumIcon = () => {
    const icon = ethereumIcon?.cloneNode(true) as HTMLImageElement | null;
    if (!icon) return null;
    icon.removeAttribute('alt');
    Object.assign(icon.style, {
      width: '40px',
      height: '40px',
      flex: '0 0 40px',
      objectFit: 'contain',
    });
    return icon;
  };
  const makeBadge = (text: string, variant: 'success' | 'neutral' = 'success') => {
    const badge = makeText(text, {
      display: 'inline-flex',
      alignItems: 'center',
      height: '20px',
      marginLeft: '4px',
      padding: '0 6px',
      borderRadius: '6px',
      background:
        variant === 'neutral' ? 'rgba(226,226,255,0.106)' : 'rgba(186,242,74,0.14)',
      color: variant === 'neutral' ? '#9B9B9B' : '#BAF24A',
      fontSize: '12px',
      fontWeight: '500',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
    });
    return badge;
  };
  const makePositionRow = ({
    title,
    subtitle,
    badge,
    badgeVariant,
    amount,
    change,
  }: {
    title: string;
    subtitle: string;
    badge?: string;
    badgeVariant?: 'success' | 'neutral';
    amount: string;
    change: string;
  }) => {
    const row = frameDocument.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      marginTop: '16px',
      minHeight: '46px',
    });

    const left = frameDocument.createElement('div');
    Object.assign(left.style, {
      display: 'flex',
      alignItems: 'center',
      minWidth: '0',
      gap: '12px',
    });
    const icon = makeEthereumIcon();
    if (icon) left.append(icon);

    const copy = frameDocument.createElement('div');
    Object.assign(copy.style, { minWidth: '0' });
    const titleRow = frameDocument.createElement('div');
    Object.assign(titleRow.style, {
      display: 'flex',
      alignItems: 'center',
      minWidth: '0',
    });
    const titleElement = makeText(title, {
      color: '#fff',
      fontSize: '16px',
      fontWeight: '500',
      lineHeight: '24px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    titleRow.append(titleElement);
    if (badge) titleRow.append(makeBadge(badge, badgeVariant));
    copy.append(titleRow);
    copy.append(
      makeText(subtitle, {
        color: '#9B9B9B',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '22px',
      }),
    );
    left.append(copy);

    const right = frameDocument.createElement('div');
    Object.assign(right.style, {
      flex: '0 0 auto',
      textAlign: 'right',
    });
    right.append(
      makeText(amount, {
        color: '#fff',
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makeText(change, {
        color: '#BAF24A',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '22px',
      }),
    );
    row.append(left, right);
    return row;
  };
  const makeRewardIcon = (kind: 'rewards' | 'annual') => {
    const iconWrap = frameDocument.createElement('div');
    Object.assign(iconWrap.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '40px',
      height: '40px',
      flex: '0 0 40px',
      borderRadius: '50%',
      background: '#252628',
      color: '#fff',
    });
    const svg = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    const path = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );
    path.setAttribute(
      'd',
      kind === 'rewards'
        ? 'M8.4 21C6.88333 21 5.60417 20.4792 4.5625 19.4375C3.52083 18.3958 3 17.1167 3 15.6C3 14.9667 3.10833 14.35 3.325 13.75C3.54167 13.15 3.85 12.6083 4.25 12.125L7.8 7.85L5.375 3H18.625L16.2 7.85L19.75 12.125C20.15 12.6083 20.4583 13.15 20.675 13.75C20.8917 14.35 21 14.9667 21 15.6C21 17.1167 20.475 18.3958 19.425 19.4375C18.375 20.4792 17.1 21 15.6 21H8.4ZM12 16C11.45 16 10.9792 15.8042 10.5875 15.4125C10.1958 15.0208 10 14.55 10 14C10 13.45 10.1958 12.9792 10.5875 12.5875C10.9792 12.1958 11.45 12 12 12C12.55 12 13.0208 12.1958 13.4125 12.5875C13.8042 12.9792 14 13.45 13.4125 15.4125C13.0208 15.8042 12.55 16 12 16ZM9.625 7H14.375L15.375 5H8.625L9.625 7ZM8.4 19H15.6C16.55 19 17.3542 18.6708 18.0125 18.0125C18.6708 17.3542 19 16.55 19 15.6C19 15.2 18.9292 14.8125 18.7875 14.4375C18.6458 14.0625 18.45 13.725 18.2 13.425L14.525 9H9.5L5.8 13.4C5.55 13.7 5.35417 14.0417 5.2125 14.425C5.07083 14.8083 5 15.2 5 15.6C5 16.55 5.32917 17.3542 5.9875 18.0125C6.64583 18.6708 7.45 19 8.4 19Z'
        : 'M15.3 16.7L16.7 15.3L13 11.6V7H11V12.4L15.3 16.7ZM12 22C10.6167 22 9.31667 21.7375 8.1 21.2125C6.88333 20.6875 5.825 19.975 4.925 19.075C4.025 18.175 3.3125 17.1167 2.7875 15.9C2.2625 14.6833 2 13.3833 2 12C2 10.6167 2.2625 9.31667 2.7875 8.1C3.3125 6.88333 4.025 5.825 4.925 4.925C5.825 4.025 6.88333 3.3125 8.1 2.7875C9.31667 2.2625 10.6167 2 12 2C13.3833 2 14.6833 2.2625 15.9 2.7875C17.1167 3.3125 18.175 4.025 19.075 4.925C19.975 5.825 20.6875 6.88333 21.2125 8.1C21.7375 9.31667 22 10.6167 22 12C22 13.3833 21.7375 14.6833 21.2125 15.9C20.6875 17.1167 19.975 18.175 19.075 19.075C18.175 19.975 17.1167 20.6875 15.9 21.2125C14.6833 21.7375 13.3833 22 12 22ZM12 20C14.2167 20 16.1042 19.2208 17.6625 17.6625C19.2208 16.1042 20 14.2167 20 12C20 9.78333 19.2208 7.89583 17.6625 6.3375C16.1042 4.77917 14.2167 4 12 4C9.78333 4 7.89583 4.77917 6.3375 6.3375C4.77917 7.89583 4 9.78333 4 12C4 14.2167 4.77917 16.1042 6.3375 17.6625C7.89583 19.2208 9.78333 20 12 20Z',
    );
    path.setAttribute('fill', 'white');
    svg.append(path);
    iconWrap.append(svg);
    return iconWrap;
  };
  const makeRewardRow = (
    icon: 'rewards' | 'annual',
    title: string,
    value: string,
  ) => {
    const row = frameDocument.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginTop: '16px',
      minHeight: '46px',
    });
    row.append(makeRewardIcon(icon));
    const copy = frameDocument.createElement('div');
    copy.append(
      makeText(title, {
        color: '#fff',
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makeText(value, {
        color: '#9B9B9B',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '22px',
      }),
    );
    row.append(copy);
    return row;
  };
  const makeActivityIcon = () => {
    const iconWrap = frameDocument.createElement('div');
    Object.assign(iconWrap.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '56px',
      height: '56px',
      flex: '0 0 56px',
      borderRadius: '50%',
      background: '#12151D',
    });

    const svg = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    svg.setAttribute('width', '56');
    svg.setAttribute('height', '56');
    svg.setAttribute('viewBox', '0 0 56 56');
    svg.setAttribute('fill', 'none');

    const coin = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    );
    coin.setAttribute('cx', '27');
    coin.setAttribute('cy', '28');
    coin.setAttribute('r', '20');
    coin.setAttribute('fill', '#3568D4');
    coin.setAttribute('stroke', '#7F9CFF');
    coin.setAttribute('stroke-width', '2');

    const dollar = frameDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'text',
    );
    dollar.setAttribute('x', '27');
    dollar.setAttribute('y', '36');
    dollar.setAttribute('text-anchor', 'middle');
    dollar.setAttribute('fill', '#fff');
    dollar.setAttribute('font-family', 'Geist, sans-serif');
    dollar.setAttribute('font-size', '24');
    dollar.setAttribute('font-weight', '600');
    dollar.textContent = '$';

    const createBar = (
      x: string,
      y: string,
      width: string,
      color: string,
    ) => {
      const bar = frameDocument.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect',
      );
      bar.setAttribute('x', x);
      bar.setAttribute('y', y);
      bar.setAttribute('width', width);
      bar.setAttribute('height', '5');
      bar.setAttribute('rx', '2.5');
      bar.setAttribute('fill', color);
      return bar;
    };

    svg.append(
      coin,
      dollar,
      createBar('38', '31', '12', '#8E7BFF'),
      createBar('41', '36', '10', '#BAF24A'),
      createBar('38', '41', '12', '#8E7BFF'),
    );
    iconWrap.append(svg);
    return iconWrap;
  };
  const makeActivitySection = () => {
    const activitySection = frameDocument.createElement('div');
    activitySection.className = 'px-4 mt-6';
    activitySection.append(
      makeText('USD Coin activity', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makeText('Jan 16, 2026', {
        marginTop: '28px',
        color: '#9B9B9B',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
      }),
    );

    const transactionRow = frameDocument.createElement('div');
    Object.assign(transactionRow.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      marginTop: '24px',
    });

    const transactionCopy = frameDocument.createElement('div');
    Object.assign(transactionCopy.style, {
      display: 'flex',
      alignItems: 'center',
      minWidth: '0',
      gap: '12px',
    });
    const transactionText = frameDocument.createElement('div');
    Object.assign(transactionText.style, { minWidth: '0' });
    transactionText.append(
      makeText('Received USDC', {
        color: '#fff',
        fontSize: '18px',
        fontWeight: '500',
        lineHeight: '24px',
        whiteSpace: 'nowrap',
      }),
      makeText('From: Cc3bPpZ...rTCu6', {
        marginTop: '2px',
        color: '#9B9B9B',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '22px',
        whiteSpace: 'nowrap',
      }),
    );
    transactionCopy.append(makeActivityIcon(), transactionText);
    transactionRow.append(
      transactionCopy,
      makeText('+20.27 USDC', {
        flex: '0 0 auto',
        color: '#BAF24A',
        fontSize: '18px',
        fontWeight: '500',
        lineHeight: '24px',
        whiteSpace: 'nowrap',
      }),
    );
    activitySection.append(transactionRow);

    const historyLink = frameDocument.createElement('a');
    historyLink.href = 'https://solscan.io/';
    historyLink.target = '_blank';
    historyLink.rel = 'noreferrer';
    historyLink.textContent = 'View full history on Solscan';
    Object.assign(historyLink.style, {
      display: 'block',
      marginTop: '52px',
      color: '#9B9BFF',
      fontSize: '18px',
      fontWeight: '500',
      lineHeight: '24px',
      textAlign: 'center',
      textDecoration: 'none',
    });
    activitySection.append(historyLink);
    return activitySection;
  };
  const makeMarketInsightsBanner = () => {
    const banner = frameDocument.createElement('div');
    Object.assign(banner.style, {
      margin: '16px 16px 0',
      padding: '16px',
      border: 'none',
      borderRadius: '12px',
      background: '#1D1E20',
      color: '#fff',
    });

    const headingRow = frameDocument.createElement('div');
    Object.assign(headingRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    });
    headingRow.append(
      makeText('Market insights', {
        color: '#fff',
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '22px',
      }),
      makeMaterialIcon('chevron_right', 20, '#fff'),
    );

    banner.append(
      headingRow,
      makeText(
        'Bitcoin is struggling continuing a sharp downtrend due to extreme fear of US and Iran tensions, weak...',
        {
          marginTop: '8px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '20px',
        },
      ),
    );

    const metadataRow = frameDocument.createElement('div');
    Object.assign(metadataRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '8px',
      color: '#9B9B9B',
    });
    metadataRow.append(
      makeMaterialIcon('auto_awesome', 18, '#D967D8'),
      makeText('AI generated • 1h ago', {
        color: '#9B9B9B',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '20px',
      }),
    );
    const infoButton = frameDocument.createElement('button');
    infoButton.type = 'button';
    infoButton.setAttribute('aria-label', 'More information about this insight');
    Object.assign(infoButton.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      padding: '4px',
      border: '0',
      borderRadius: '8px',
      background: 'transparent',
      color: '#9B9B9B',
      cursor: 'pointer',
    });
    infoButton.append(makeMaterialIcon('info_outline', 16, '#9B9B9B'));
    metadataRow.append(infoButton);
    banner.append(metadataRow);

    const sheetOverlay = frameDocument.createElement('div');
    Object.assign(sheetOverlay.style, {
      position: 'fixed',
      zIndex: '80',
      inset: '0',
      display: 'none',
      alignItems: 'flex-end',
      background: '#00000099',
      opacity: '0',
      transition: 'opacity 180ms ease',
    });
    sheetOverlay.setAttribute('aria-hidden', 'true');

    const sheet = frameDocument.createElement('section');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'market-insights-sheet-title');
    Object.assign(sheet.style, {
      width: '100%',
      minHeight: '220px',
      maxHeight: '492px',
      padding: '16px',
      borderRadius: '24px 24px 0 0',
      background: '#18181B',
      color: '#fff',
      transform: 'translateY(100%)',
      transition: 'transform 220ms ease',
      boxSizing: 'border-box',
    });

    const sheetHeader = frameDocument.createElement('div');
    Object.assign(sheetHeader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: '32px',
    });
    const sheetTitle = makeText('Insight details', {
      color: '#fff',
      fontSize: '20px',
      fontWeight: '500',
      lineHeight: '24px',
    });
    sheetTitle.id = 'market-insights-sheet-title';
    const sheetCloseButton = frameDocument.createElement('button');
    sheetCloseButton.type = 'button';
    sheetCloseButton.setAttribute('aria-label', 'Close insight details');
    Object.assign(sheetCloseButton.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      padding: '4px',
      border: '0',
      borderRadius: '8px',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
    });
    sheetCloseButton.append(makeMaterialIcon('close', 16, '#fff'));
    sheetHeader.append(sheetTitle, sheetCloseButton);
    sheet.append(
      sheetHeader,
      makeText('This market insight was generated by AI.', {
        marginTop: '16px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '20px',
      }),
    );
    sheetOverlay.append(sheet);
    frameDocument.body.append(sheetOverlay);
    addedPositionNodes.push(sheetOverlay);

    let sheetCloseTimer: number | undefined;
    const closeSheet = () => {
      sheetOverlay.style.opacity = '0';
      sheet.style.transform = 'translateY(100%)';
      sheetOverlay.setAttribute('aria-hidden', 'true');
      sheetCloseTimer = frameDocument.defaultView?.setTimeout(() => {
        sheetOverlay.style.display = 'none';
      }, 220);
    };
    const openSheet = () => {
      if (sheetCloseTimer !== undefined) {
        frameDocument.defaultView?.clearTimeout(sheetCloseTimer);
      }
      sheetOverlay.style.display = 'flex';
      sheetOverlay.setAttribute('aria-hidden', 'false');
      frameDocument.defaultView?.requestAnimationFrame(() => {
        sheetOverlay.style.opacity = '1';
        sheet.style.transform = 'translateY(0)';
      });
    };

    const insightsPage = frameDocument.createElement('section');
    insightsPage.setAttribute('aria-label', 'Market Insights');
    insightsPage.setAttribute('aria-hidden', 'true');
    const originalBodyOverflow = frameDocument.body.style.overflow;
    Object.assign(insightsPage.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '120',
      display: 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#131416',
      color: '#fff',
      transform: 'translateX(100%)',
      transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
      fontFamily: 'inherit',
    });

    const insightsHeader = frameDocument.createElement('header');
    Object.assign(insightsHeader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      minHeight: '48px',
      flexShrink: '0',
      borderBottom: '1px solid rgba(180, 180, 181, 0.12)',
    });
    const insightsBackButton = frameDocument.createElement('button');
    insightsBackButton.type = 'button';
    insightsBackButton.setAttribute('aria-label', 'Back to token details');
    Object.assign(insightsBackButton.style, {
      position: 'absolute',
      left: '8px',
      top: '8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      padding: '4px',
      border: '0',
      borderRadius: '8px',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
    });
    insightsBackButton.append(makeMaterialIcon('chevron_left', 20, '#fff'));
    insightsHeader.append(
      makeText('Market Insights', {
        color: '#fff',
        fontSize: '12px',
        fontWeight: '600',
        lineHeight: '16px',
      }),
      insightsBackButton,
    );

    const insightsContent = frameDocument.createElement('div');
    Object.assign(insightsContent.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '16px',
      boxSizing: 'border-box',
      scrollbarWidth: 'none',
    });

    const insightGraphic = frameDocument.createElement('div');
    Object.assign(insightGraphic.style, {
      height: '132px',
      margin: '0 -2px 20px',
      backgroundColor: '#131416',
      backgroundImage: `url(${starsAsset})`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%',
    });
    insightsContent.append(insightGraphic);

    const makeInsightSection = (title: string, body: string) => {
      const section = frameDocument.createElement('section');
      Object.assign(section.style, {
        marginBottom: '16px',
      });
      section.append(
        makeText(title, {
          color: '#fff',
          fontSize: '14px',
          fontWeight: '600',
          lineHeight: '20px',
        }),
        makeText(body, {
          marginTop: '6px',
          color: '#9B9B9B',
          fontSize: '12px',
          fontWeight: '400',
          lineHeight: '17px',
        }),
      );
      return section;
    };

    insightsContent.append(
      makeText('BTC at a 15-month low due to “extreme fear”', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '600',
        lineHeight: '24px',
      }),
      makeText(
        'Bitcoin is struggling following a sharp downturn due to extreme fear of US and Iran tensions, macro-weak jobs data, and Fed uncertainty.',
        {
          marginTop: '8px',
          marginBottom: '18px',
          color: '#9B9B9B',
          fontSize: '12px',
          fontWeight: '400',
          lineHeight: '17px',
        },
      ),
      makeInsightSection(
        'US-Iran tensions',
        'Escalating conflict sparked global markets. Unlike gold, which saw some safe-haven inflows, Bitcoin has been treated as a “risk-on” asset and sold off alongside tech stocks.',
      ),
      makeText('🟡 CoinDesk', {
        marginTop: '-8px',
        marginBottom: '16px',
        color: '#9B9B9B',
        fontSize: '10px',
        lineHeight: '14px',
      }),
      makeInsightSection(
        'Weak jobs data',
        'Today’s ADP report showed private payrolls rose by only 22,000 in January, missing expectations. This signals a lackluster economic start to 2026, dampening investor appetite for risk.',
      ),
      makeText('🔵 Trading view +2', {
        marginTop: '-8px',
        marginBottom: '16px',
        color: '#9B9B9B',
        fontSize: '10px',
        lineHeight: '14px',
      }),
      makeInsightSection(
        'Fed uncertainty',
        'Today’s ADP report showed private payrolls rose by only 22,000 in January, missing expectations. This signals a lackluster economic start to 2026, dampening investor appetite for risk.',
      ),
      makeText('🟡🔵 Trading view +3', {
        marginTop: '-8px',
        marginBottom: '24px',
        color: '#9B9B9B',
        fontSize: '10px',
        lineHeight: '14px',
      }),
    );

    const socialDivider = frameDocument.createElement('div');
    Object.assign(socialDivider.style, {
      height: '1px',
      margin: '0 -16px 16px',
      background: 'rgba(180, 180, 181, 0.16)',
    });
    insightsContent.append(socialDivider);
    insightsContent.append(
      makeText('What’s being said', {
        color: '#fff',
        fontSize: '16px',
        fontWeight: '600',
        lineHeight: '20px',
      }),
    );

    const makeSocialCard = (body: string, author: string) => {
      const card = frameDocument.createElement('article');
      Object.assign(card.style, {
        marginTop: '12px',
        padding: '12px',
        borderRadius: '12px',
        background: '#222226',
      });
      card.append(
        makeText(body, {
          color: '#fff',
          fontSize: '12px',
          lineHeight: '17px',
        }),
        makeText(author, {
          marginTop: '8px',
          color: '#9B9B9B',
          fontSize: '10px',
          lineHeight: '14px',
        }),
      );
      return card;
    };

    insightsContent.append(
      makeSocialCard(
        '🚨 BREAKING: Elon Musk has reportedly become the first person in history to hit a $1 TRILLION net worth.\n\nMeanwhile, Bitcoin’s market cap sits around $1.35 TRILLION.',
        '🦅 @eth_taco · 1mo ago',
      ),
      makeSocialCard(
        'This is the best chart in #Crypto #Bitcoin\n\nThe representation of the current status of the markets can’t be explained by a better chart.',
        '🟢 @CryptoMichNL · 1mo ago',
      ),
    );

    const insightsFeedback = frameDocument.createElement('div');
    Object.assign(insightsFeedback.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      padding: '24px 0 16px',
    });
    const feedbackButtons = frameDocument.createElement('div');
    Object.assign(feedbackButtons.style, {
      display: 'flex',
      gap: '16px',
    });
    [makeMaterialIcon('thumb_up', 18, '#9B9B9B'), makeMaterialIcon('thumb_down', 18, '#9B9B9B')].forEach(
      (icon, index) => {
        const button = frameDocument.createElement('button');
        button.type = 'button';
        button.setAttribute(
          'aria-label',
          index === 0 ? 'Helpful' : 'Not helpful',
        );
        Object.assign(button.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          padding: '7px',
          border: '0',
          borderRadius: '8px',
          background: 'transparent',
          cursor: 'pointer',
        });
        button.append(icon);
        feedbackButtons.append(button);
      },
    );
    insightsFeedback.append(
      feedbackButtons,
      makeText('Was this helpful?', {
        color: '#9B9B9B',
        fontSize: '10px',
        lineHeight: '14px',
      }),
    );
    insightsContent.append(insightsFeedback);

    const insightsActions = frameDocument.createElement('footer');
    Object.assign(insightsActions.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flexShrink: '0',
      padding: '12px 16px 16px',
      borderTop: '1px solid rgba(180, 180, 181, 0.12)',
      background: '#131416',
    });
    const actionRow = frameDocument.createElement('div');
    Object.assign(actionRow.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
    });
    const makeInsightAction = (label: string, filled: boolean) => {
      const button = frameDocument.createElement('button');
      button.type = 'button';
      Object.assign(button.style, {
        height: '40px',
        border: filled ? '0' : '1px solid #fff',
        borderRadius: '8px',
        background: filled ? '#fff' : 'transparent',
        color: filled ? '#131416' : '#fff',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '20px',
        cursor: 'pointer',
      });
      button.textContent = label;
      return button;
    };
    actionRow.append(
      makeInsightAction('Swap', false),
      makeInsightAction('Buy', true),
    );
    insightsActions.append(
      actionRow,
      makeText('AI summary for information only', {
        color: '#9B9B9B',
        fontSize: '10px',
        lineHeight: '14px',
        textAlign: 'center',
      }),
    );

    insightsPage.append(insightsHeader, insightsContent, insightsActions);
    frameDocument.body.append(insightsPage);
    addedPositionNodes.push(insightsPage);

    let pageCloseTimer: number | undefined;
    const closeInsightsPage = () => {
      insightsPage.style.transform = 'translateX(100%)';
      insightsPage.setAttribute('aria-hidden', 'true');
      pageCloseTimer = frameDocument.defaultView?.setTimeout(() => {
        insightsPage.style.display = 'none';
        frameDocument.body.style.overflow = originalBodyOverflow;
      }, 280);
    };
    const openInsightsPage = () => {
      if (pageCloseTimer !== undefined) {
        frameDocument.defaultView?.clearTimeout(pageCloseTimer);
      }
      insightsPage.style.display = 'flex';
      insightsPage.setAttribute('aria-hidden', 'false');
      frameDocument.body.style.overflow = 'hidden';
      frameDocument.defaultView?.requestAnimationFrame(() => {
        insightsPage.style.transform = 'translateX(0)';
      });
    };
    insightsBackButton.addEventListener('click', closeInsightsPage);
    infoButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openSheet();
    });
    banner.addEventListener('click', openInsightsPage);
    sheetCloseButton.addEventListener('click', closeSheet);
    sheetOverlay.addEventListener('click', (event) => {
      if (event.target === sheetOverlay) closeSheet();
    });

    return banner;
  };
  const fullWidthDividers = Array.from(
    frameDocument.querySelectorAll<HTMLElement>('div[style]'),
  ).filter((element) => element.style.borderTop.includes('180'));
  const originalDividerStyles = fullWidthDividers.map((element) => ({
    element,
    width: element.style.width,
    marginLeft: element.style.marginLeft,
  }));
  fullWidthDividers.forEach((divider) => {
    divider.style.width = '100vw';
    divider.style.marginLeft = 'calc(50% - 50vw)';
  });

  const dividerAfterActions = actionMenu?.nextElementSibling as HTMLElement | null;
  const yourPositionSection =
    dividerAfterActions?.nextElementSibling as HTMLElement | null;
  const dividerAfterPosition =
    yourPositionSection?.nextElementSibling as HTMLElement | null;
  const securitySection =
    dividerAfterPosition?.nextElementSibling as HTMLElement | null;
  const securityArrowPath = securitySection?.querySelector<SVGPathElement>(
    'button svg path',
  );
  const originalSecurityArrowStroke =
    securityArrowPath?.getAttribute('stroke') ?? null;
  securityArrowPath?.setAttribute('stroke', '#9B9B9B');
  const aboutHeading = Array.from(
    frameDocument.querySelectorAll<HTMLElement>('h3'),
  ).find((heading) => heading.textContent?.trim() === 'About');
  const aboutSection = aboutHeading?.closest(
    'div.px-4.mt-5',
  ) as HTMLElement | null;
  const headingMdLabels = new Set(['Security and trust', 'Stats', 'About']);
  frameDocument.querySelectorAll<HTMLElement>('h3').forEach((heading) => {
    if (headingMdLabels.has(heading.textContent?.trim() ?? '')) {
      Object.assign(heading.style, {
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      });
    }
  });

  if (yourPositionSection) {
    const positionGrid = Array.from(yourPositionSection.children).find(
      (child) => child.classList.contains('grid'),
    );
    const positionHeading = yourPositionSection.querySelector<HTMLElement>('h3');
    if (positionHeading) {
      Object.assign(positionHeading.style, {
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      });
    }
    const tokenRow = makePositionRow({
      title: 'Ethereum',
      subtitle: '0.4424 ETH',
      amount: '$10,001.11',
      change: '+1.31%',
    });
    if (positionGrid) {
      positionGrid.remove();
      yourPositionSection.append(tokenRow);
    } else {
      yourPositionSection.append(tokenRow);
    }
    addedPositionNodes.push(tokenRow);
  }

  if (actionMenu?.parentNode && dividerAfterActions) {
    const marketInsightsBanner = makeMarketInsightsBanner();
    actionMenu.parentNode.insertBefore(
      marketInsightsBanner,
      dividerAfterActions,
    );
    addedPositionNodes.push(marketInsightsBanner);
  }

  if (securitySection?.parentNode) {
    const perpsSection = frameDocument.createElement('div');
    perpsSection.className = 'px-4 mt-5';
    perpsSection.append(
      makeText('Perps position', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makePositionRow({
        title: 'Ethereum',
        subtitle: '$297.4M',
        badge: '20x',
        badgeVariant: 'neutral',
        amount: '$123.45',
        change: '+12.90%',
      }),
    );

    const earningsSection = frameDocument.createElement('div');
    earningsSection.className = 'px-4 mt-5';
    earningsSection.append(
      makeText('Earnings', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makePositionRow({
        title: 'Staked Ether...',
        subtitle: '0.37 ETH',
        badge: '2.2% APR',
        amount: '$12.12',
        change: '+$9.63 (+12.9%)',
      }),
      makeRewardRow('rewards', 'Total rewards', '$20 • 0.283 ETH'),
      makeRewardRow(
        'annual',
        'Estimated annual rewards',
        '$50.20 • 0.124 ETH',
      ),
    );

    const earningsActions = frameDocument.createElement('div');
    Object.assign(earningsActions.style, {
      display: 'flex',
      gap: '16px',
      marginTop: '20px',
    });
    ['Withdraw', 'Earn more'].forEach((label) => {
      const button = frameDocument.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        flex: '1',
        height: '48px',
        border: '0',
        borderRadius: '12px',
        background: '#1D1E20',
        color: '#fff',
        fontFamily: 'Geist, sans-serif',
        fontSize: '16px',
        fontWeight: '600',
        lineHeight: '24px',
      });
      earningsActions.append(button);
    });
    earningsSection.append(earningsActions);

    const perpsDivider = makeDivider();
    const earningsDivider = makeDivider();
    securitySection.parentNode.insertBefore(perpsSection, securitySection);
    securitySection.parentNode.insertBefore(perpsDivider, securitySection);
    securitySection.parentNode.insertBefore(earningsSection, securitySection);
    securitySection.parentNode.insertBefore(earningsDivider, securitySection);
    addedPositionNodes.push(perpsSection, earningsSection);

    if (aboutSection?.parentNode) {
      const activityDivider = makeDivider();
      const activitySection = makeActivitySection();
      aboutSection.parentNode.insertBefore(activityDivider, aboutSection.nextSibling);
      aboutSection.parentNode.insertBefore(
        activitySection,
        activityDivider.nextSibling,
      );
      addedPositionNodes.push(activitySection);
    }
  }

  chartRegion.dataset.tradingViewChart = 'ready';
  chartRegion.replaceChildren();
  chartRegion.style.height = '240px';

  const chartHost = frameDocument.createElement('div');
  Object.assign(chartHost.style, {
    width: '100%',
    height: '240px',
    minHeight: '240px',
    position: 'relative',
  });

  chartRegion.append(chartHost);

  const { lineData, candleData } = buildChartData();
  const chart = createChart(chartHost, {
    width: chartHost.clientWidth,
    height: 240,
    layout: {
      background: { type: ColorType.Solid, color: '#131416' },
      textColor: '#9b9b9b',
      fontFamily: 'Geist, Inter, sans-serif',
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(255,255,255,0.24)',
        labelBackgroundColor: '#252628',
      },
      horzLine: {
        color: 'rgba(255,255,255,0.24)',
        labelBackgroundColor: '#252628',
      },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.12, bottom: 0.12 },
    },
    leftPriceScale: { visible: false },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 1,
      barSpacing: 5.4,
    },
    localization: {
      priceFormatter: (price: number) =>
        price.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
    },
    handleScroll: true,
    handleScale: true,
  });

  let activeSeries: ISeriesApi<SeriesType>;
  let activeMode: 'line' | 'candles' = 'line';
  const livePrice = lineData[lineData.length - 1].value;
  const formatHeaderPrice = (price: number) =>
    `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const setHeaderPrice = (price: number) => {
    if (headerPrice) headerPrice.textContent = formatHeaderPrice(price);
  };
  const updateHeaderPrice = (param: MouseEventParams) => {
    if (!activeSeries || param.time === undefined) {
      setHeaderPrice(livePrice);
      return;
    }

    const point = param.seriesData.get(activeSeries) as
      | { value?: number; close?: number }
      | undefined;
    setHeaderPrice(point?.value ?? point?.close ?? livePrice);
  };

  const materialIconLink = frameDocument.createElement('link');
  materialIconLink.rel = 'stylesheet';
  materialIconLink.href =
    'https://fonts.googleapis.com/icon?family=Material+Icons';
  frameDocument.head.append(materialIconLink);

  const pointerCursorStyle = frameDocument.createElement('style');
  const tapCursor = `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="#BAF24A" fill-opacity=".95" stroke="#131416" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#131416"/></svg>',
  )}") 12 12, pointer`;
  pointerCursorStyle.textContent = `
    html,
    body,
    body * {
      cursor: ${tapCursor} !important;
    }
  `;
  frameDocument.head.append(pointerCursorStyle);

  const updateMoreIcon = () => {
    if (!moreButton) return;
    const originalIcon = moreButton.querySelector('img, svg');
    if (!originalIcon) return;

    const moreIcon = frameDocument.createElement('span');
    moreIcon.className = 'material-icons';
    moreIcon.textContent = 'more_horiz';
    moreIcon.setAttribute('aria-hidden', 'true');
    Object.assign(moreIcon.style, {
      display: 'inline-block',
      width: '20px',
      height: '20px',
      color: '#9B9B9B',
      fontSize: '24px',
      lineHeight: '20px',
    });
    originalIcon.replaceWith(moreIcon);
  };
  updateMoreIcon();

  const pulseStyle = frameDocument.createElement('style');
  pulseStyle.textContent = `
    @keyframes quick-swap-live-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(186, 242, 74, 0.44);
        transform: translate(-50%, -50%) scale(1);
      }
      55% {
        box-shadow: 0 0 0 7px rgba(186, 242, 74, 0);
        transform: translate(-50%, -50%) scale(1.08);
      }
    }
  `;
  frameDocument.head.append(pulseStyle);

  const liveDot = frameDocument.createElement('span');
  liveDot.setAttribute('aria-label', 'Live chart data');
  Object.assign(liveDot.style, {
    position: 'absolute',
    zIndex: '3',
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#BAF24A',
    border: '2px solid #131416',
    pointerEvents: 'none',
    animation: 'quick-swap-live-pulse 1.8s ease-out infinite',
    display: 'none',
  });
  chartHost.append(liveDot);

  const updateLiveDot = () => {
    if (!activeSeries || activeMode !== 'line') {
      liveDot.style.display = 'none';
      return;
    }

    const lastPoint = lineData[lineData.length - 1];
    const x = chart.timeScale().timeToCoordinate(lastPoint.time);
    const y = activeSeries.priceToCoordinate(lastPoint.value);

    if (x === null || y === null) {
      liveDot.style.display = 'none';
      return;
    }

    liveDot.style.left = `${x}px`;
    liveDot.style.top = `${y}px`;
    liveDot.style.display = 'block';
  };

  const updateChartModeIcon = () => {
    if (!chartModeButton) return;

    if (activeMode === 'line') {
      const lineIcon = frameDocument.createElement('span');
      lineIcon.className = 'material-icons';
      lineIcon.textContent = 'show_chart';
      lineIcon.setAttribute('aria-hidden', 'true');
      Object.assign(lineIcon.style, {
        display: 'inline-block',
        width: '20px',
        height: '20px',
        color: '#BAF24A',
        fontSize: '20px',
        lineHeight: '20px',
      });
      chartModeButton.replaceChildren(lineIcon);
      chartModeButton.setAttribute('aria-label', 'Show candlestick chart');
    } else {
      chartModeButton.replaceChildren(
        ...originalChartIcon.map((node) => node.cloneNode(true)),
      );
      chartModeButton.setAttribute('aria-label', 'Show line chart');
    }
  };

  const showSeries = (mode: 'line' | 'candles') => {
    if (activeSeries) chart.removeSeries(activeSeries);
    activeMode = mode;

    if (mode === 'line') {
      const series = chart.addSeries(LineSeries, {
        color: '#BAF24A',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: '#131416',
        crosshairMarkerBackgroundColor: '#BAF24A',
        priceLineVisible: true,
        priceLineColor: 'rgba(186,242,74,0.45)',
        priceLineStyle: 2,
        lastValueVisible: true,
      });
      series.setData(lineData);
      activeSeries = series;
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#BAF24A',
        downColor: '#F0747A',
        borderUpColor: '#BAF24A',
        borderDownColor: '#F0747A',
        wickUpColor: '#BAF24A',
        wickDownColor: '#F0747A',
        priceLineVisible: true,
        lastValueVisible: true,
      });
      series.setData(candleData);
      activeSeries = series;
    }

    updateChartModeIcon();
    chart.timeScale().fitContent();
    frameDocument.defaultView?.requestAnimationFrame(updateLiveDot);
  };

  const toggleChartMode = () =>
    showSeries(activeMode === 'line' ? 'candles' : 'line');
  chartModeButton?.addEventListener('click', toggleChartMode);
  showSeries('line');
  chart.timeScale().subscribeVisibleLogicalRangeChange(updateLiveDot);
  chart.subscribeCrosshairMove(updateHeaderPrice);

  const resizeObserver = new ResizeObserver(([entry]) => {
    chart.applyOptions({ width: Math.floor(entry.contentRect.width) });
    updateLiveDot();
  });
  resizeObserver.observe(chartHost);

  return () => {
    frameDocument.defaultView?.removeEventListener(
      'message',
      handleHeaderModeMessage,
    );
    copyButton.removeEventListener('click', copyAddress);
    if (copyToastTimer !== undefined) {
      frameDocument.defaultView?.clearTimeout(copyToastTimer);
    }
    copyToast.remove();
    condensedHeader.remove();
    chartModeButton?.removeEventListener('click', toggleChartMode);
    if (chartModeButton) {
      chartModeButton.replaceChildren(
        ...originalChartIcon.map((node) => node.cloneNode(true)),
      );
      chartModeButton.setAttribute('aria-label', 'Indicators');
    }
    if (moreButton) {
      moreButton.replaceChildren(
        ...originalMoreChildren.map((node) => node.cloneNode(true)),
      );
    }
    originalDividerStyles.forEach(({ element, width, marginLeft }) => {
      element.style.width = width;
      element.style.marginLeft = marginLeft;
    });
    if (securityArrowPath) {
      if (originalSecurityArrowStroke === null) {
        securityArrowPath.removeAttribute('stroke');
      } else {
        securityArrowPath.setAttribute('stroke', originalSecurityArrowStroke);
      }
    }
    frameDocument.body.style.overflow = '';
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateLiveDot);
    chart.unsubscribeCrosshairMove(updateHeaderPrice);
    resizeObserver.disconnect();
    pulseStyle.remove();
    materialIconLink.remove();
    pointerCursorStyle.remove();
    chart.remove();
  };
}

function waitForTradingViewChart(
  frame: HTMLIFrameElement,
  initialHeaderMode: HeaderMode = 'demo',
) {
  let chartCleanup: (() => void) | undefined;
  let attempts = 0;

  const timer = window.setInterval(() => {
    attempts += 1;
    chartCleanup = installTradingViewChart(frame, initialHeaderMode);
    if (chartCleanup || attempts >= 60) {
      window.clearInterval(timer);
    }
  }, 50);

  return () => {
    window.clearInterval(timer);
    chartCleanup?.();
  };
}

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
          className="relative w-full h-full sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:border-[14px] sm:border-[#242628] bg-background overflow-hidden sm:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_60px_rgba(0,0,0,0.6)] flex flex-col"
        >
          
          {isLoading && !hasError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background space-y-4">
               <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
            </div>
          )}

          {hasError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background px-6 text-center">
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
              className={`flex-1 w-full border-0 bg-background transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
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
