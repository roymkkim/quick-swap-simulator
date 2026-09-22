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

export type HeaderMode = 'demo' | 'condensed';
type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y';

const TIMEFRAMES: Timeframe[] = ['1H', '1D', '1W', '1M', '1Y'];
const BG_DEFAULT = '#000000';
const BG_SECTION = '#18181B';
const BG_SUBSECTION = '#222226';
const PRIMARY_BLUE = '#8B99FF';
const LIVE_PRICE = 2255.8;
const CHART_END_TIME = 1_755_838_500 as UTCTimestamp;

const TIMEFRAME_CONFIG: Record<
  Timeframe,
  { interval: number; bars: number; barSpacing: number; timeVisible: boolean }
> = {
  '1H': { interval: 60, bars: 60, barSpacing: 5.4, timeVisible: true },
  '1D': { interval: 15 * 60, bars: 96, barSpacing: 3.4, timeVisible: true },
  '1W': { interval: 2 * 60 * 60, bars: 84, barSpacing: 4, timeVisible: false },
  '1M': { interval: 8 * 60 * 60, bars: 90, barSpacing: 3.8, timeVisible: false },
  '1Y': { interval: 3 * 24 * 60 * 60, bars: 122, barSpacing: 2.8, timeVisible: false },
};

const sourceValues = [
  20, 25, 30, 38, 50, 42, 58, 70, 82, 72, 88, 80, 60, 50, 38, 50, 42,
  30, 20, 28, 22, 34, 28, 42, 36, 46, 38, 30, 22, 14, 26, 30, 42, 36,
  50, 44, 56, 72, 80, 70, 78, 60, 52, 64, 58, 70, 64, 80, 76, 86, 78,
  84, 74, 80, 70, 62, 54, 60, 56, 64,
];

function buildChartData(timeframe: Timeframe) {
  const { interval, bars } = TIMEFRAME_CONFIG[timeframe];
  const seed = TIMEFRAMES.indexOf(timeframe) + 1;
  const priceScale = 75.8 / 64;
  const closes: number[] = [];

  for (let index = 0; index < bars; index += 1) {
    const t = (index / Math.max(bars - 1, 1)) * (sourceValues.length - 1);
    const lower = Math.floor(t);
    const upper = Math.min(lower + 1, sourceValues.length - 1);
    const mix = t - lower;
    const base = sourceValues[lower] * (1 - mix) + sourceValues[upper] * mix;
    const wobble =
      Math.sin(index * 0.27 + seed) * (2.1 + seed) +
      Math.sin(index * 0.11 * seed) * 1.8;
    closes.push(Number((2180 + (base + wobble) * priceScale).toFixed(2)));
  }

  closes[closes.length - 1] = LIVE_PRICE;
  const startTime = (CHART_END_TIME - (bars - 1) * interval) as UTCTimestamp;

  const lineData: LineData<UTCTimestamp>[] = closes.map((value, index) => ({
    time: (startTime + index * interval) as UTCTimestamp,
    value,
  }));

  const candleData: (CandlestickData<UTCTimestamp> & { volume: number })[] =
    closes.map((close, index) => {
      const open = index === 0 ? close - 4.2 : closes[index - 1];
      const wick = 2.5 + ((index + seed) % 4) * 0.85;
      return {
        time: (startTime + index * interval) as UTCTimestamp,
        open: Number(open.toFixed(2)),
        high: Number((Math.max(open, close) + wick).toFixed(2)),
        low: Number((Math.min(open, close) - wick * 0.8).toFixed(2)),
        close,
        volume: 180_000 + ((index * 37 + seed * 91) % 740_000),
      };
    });

  return { lineData, candleData };
}

export function installTradingViewChart(
  frame: { contentDocument: Document | null },
  initialHeaderMode: HeaderMode = 'demo',
) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return;

  frameDocument.documentElement.style.background = '#000';
  frameDocument.body.style.background = '#000';
  const mobileBackgroundStyle = frameDocument.createElement('style');
  mobileBackgroundStyle.textContent = `
    html, body {
      background: #000 !important;
    }
    .bg-slate-100,
    .bg-\\[\\#131416\\],
    #phone-screen,
    .phone-frame {
      background: #000 !important;
    }
    @media (max-width: 800px) {
      .bg-slate-100 > div:not(:has(#phone-screen)) {
        display: none !important;
      }
    }
  `;
  frameDocument.head.append(mobileBackgroundStyle);
  frameDocument.querySelectorAll<HTMLElement>(
    '.bg-slate-100, .bg-\\[\\#131416\\], #phone-screen, .phone-frame',
  ).forEach((el) => {
    el.style.background = '#000';
  });
  const tokenDetailsFooter = frameDocument.querySelector<HTMLElement>(
    '.absolute.bottom-0.left-0.right-0.z-20',
  );
  if (tokenDetailsFooter) tokenDetailsFooter.style.background = '#000';

  const originalChart = frameDocument.querySelector<SVGElement>(
    'svg[viewBox="0 0 360 240"]',
  );
  const chartRegion = originalChart?.parentElement;
  if (chartRegion?.dataset.tradingViewChart === 'ready') return () => {};
  if (!chartRegion) return;

  const headerPrice = Array.from(
    frameDocument.querySelectorAll<HTMLElement>('div'),
  ).find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim() === '$2,255.80',
  );
  const findPriceBlock = (priceEl: HTMLElement) => {
    let current: HTMLElement | null = priceEl;
    while (current) {
      const text = current.textContent ?? '';
      if (text.includes('Today') && text.includes('$2,255.80')) {
        if (text.includes('Ethereum')) {
          const child = Array.from(current.children).find((element) => {
            const childText = element.textContent ?? '';
            return childText.includes('Today') && childText.includes('$');
          });
          return (child as HTMLElement | undefined) ?? current;
        }
        return current;
      }
      current = current.parentElement;
    }
    return priceEl;
  };
  const priceBlock = headerPrice ? findPriceBlock(headerPrice) : null;
  const originalPriceBlockDisplay = priceBlock?.style.display ?? '';
  const originalPriceBlockVisibility = priceBlock?.style.visibility ?? '';
  const timeSelector = chartRegion.nextElementSibling as HTMLElement | null;
  const timeSelectorButtons = timeSelector?.querySelectorAll('button');
  const timeframeButtons = Array.from(timeSelectorButtons ?? []).filter(
    (button): button is HTMLButtonElement =>
      TIMEFRAMES.includes((button.textContent?.trim() ?? '') as Timeframe),
  );
  const chartModeButton = timeSelectorButtons?.item(
    (timeSelectorButtons.length ?? 1) - 1,
  );
  const originalChartIcon = chartModeButton
    ? Array.from(chartModeButton.childNodes).map((node) => node.cloneNode(true))
    : [];
  const actionMenu = timeSelector?.nextElementSibling as HTMLElement | null;
  const actionButtons = actionMenu
    ? Array.from(actionMenu.querySelectorAll<HTMLButtonElement>('button'))
    : [];
  const originalActionChildren = actionButtons.map((button) => ({
    button,
    nodes: Array.from(button.childNodes).map((node) => node.cloneNode(true)),
    ariaLabel: button.getAttribute('aria-label'),
  }));
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
      add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z',
      north_east:
        'M9 5v2h6.59L4 18.59 5.41 20 17 8.41V15h2V5H9Z',
      qr_code:
        'M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm10-2h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-2 2h2v2h-2v-2Zm-2 2h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-2 2h2v2h-2v-2Zm4 2h2v2h-2v-2Z',
      more_horiz:
        'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Z',
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
  const materialIconLink = frameDocument.createElement('link');
  materialIconLink.rel = 'stylesheet';
  materialIconLink.href =
    'https://fonts.googleapis.com/icon?family=Material+Icons';
  frameDocument.head.append(materialIconLink);
  const makeFontIcon = (name: string, size: number, color: string) => {
    const icon = frameDocument.createElement('span');
    icon.className = 'material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = name;
    Object.assign(icon.style, {
      display: 'block',
      fontSize: `${size}px`,
      width: `${size}px`,
      height: `${size}px`,
      lineHeight: `${size}px`,
      color,
    });
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
  const styleDivider = (divider: HTMLElement) => {
    divider.classList.remove('mt-5', 'mt-6', 'mb-5', 'mb-6');
    Object.assign(divider.style, {
      width: '100vw',
      marginTop: '32px',
      marginBottom: '32px',
      marginLeft: 'calc(50% - 50vw)',
      borderTop: divider.style.borderTop || '1px solid rgba(180,180,181,0.20)',
    });
  };
  const clearSectionTopMargin = (section?: HTMLElement | null) => {
    if (!section) return;
    section.classList.remove('mt-5', 'mt-6');
    section.style.marginTop = '0';
  };
  const makeDivider = () => {
    const divider = frameDocument.createElement('div');
    styleDivider(divider);
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
      background: BG_SUBSECTION,
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
  const makeActivityIcon = () => makeEthereumIcon();
  const makeActivitySection = () => {
    const activitySection = frameDocument.createElement('div');
    activitySection.className = 'px-4';
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
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '24px',
        whiteSpace: 'nowrap',
      }),
      makeText('From: Cc3bPpZ...rTCu6', {
        marginTop: '2px',
        color: '#9B9B9B',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '22px',
        whiteSpace: 'nowrap',
      }),
    );
    const activityIcon = makeActivityIcon();
    if (activityIcon) transactionCopy.append(activityIcon);
    transactionCopy.append(transactionText);
    transactionRow.append(
      transactionCopy,
      makeText('+20.27 USDC', {
        flex: '0 0 auto',
        color: '#BAF24A',
        fontSize: '16px',
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
      fontSize: '16px',
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
      background: BG_SECTION,
      color: '#fff',
    });

    const headingRow = frameDocument.createElement('div');
    Object.assign(headingRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    });
    const insightsArrow = makeMaterialIcon('chevron_right', 20, '#9B9B9B');
    insightsArrow.classList.add('quick-swap-insights-arrow');
    headingRow.append(
      makeText('Market insights', {
        color: '#fff',
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '22px',
      }),
      insightsArrow,
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
      makeMaterialIcon('auto_awesome', 18, '#FFFFFF'),
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

    const phoneScreen =
      frameDocument.querySelector<HTMLElement>(
        '.absolute.inset-0.overflow-hidden.flex.flex-col',
      ) ??
      frameDocument.querySelector<HTMLElement>(
        '.relative.bg-black.rounded-\\[45px\\]',
      ) ??
      frameDocument.body;
    phoneScreen.style.background = '#000';

    const sheetOverlay = frameDocument.createElement('div');
    Object.assign(sheetOverlay.style, {
      position: 'absolute',
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
      background: BG_SECTION,
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
    phoneScreen.append(sheetOverlay);
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

    const renameConvertToSwap = (root: ParentNode) => {
      root.querySelectorAll('button').forEach((button) => {
        button.childNodes.forEach((node) => {
          if (
            node.nodeType === Node.TEXT_NODE &&
            node.textContent?.includes('Convert')
          ) {
            node.textContent = node.textContent.replace(/Convert/g, 'Swap');
          }
        });
      });
    };
    renameConvertToSwap(frameDocument);

    const makeSlidePage = (ariaLabel: string) => {
      const page = frameDocument.createElement('section');
      page.setAttribute('aria-label', ariaLabel);
      page.setAttribute('aria-hidden', 'true');
      Object.assign(page.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '120',
        display: 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#000',
        color: '#fff',
        transform: 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        fontFamily: 'inherit',
      });
      return page;
    };
    const makeSubpageHeader = (title: string) => {
      const header = frameDocument.createElement('header');
      Object.assign(header.style, {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: '0',
        background: '#000',
      });
      const statusBar = Array.from(phoneScreen.children).find((child) =>
        (child.textContent ?? '').includes('9:41'),
      ) as HTMLElement | undefined;
      if (statusBar) header.append(statusBar.cloneNode(true));
      const headerClone = topHeader?.cloneNode(true) as HTMLElement | undefined;
      let backButton = frameDocument.createElement('button');
      backButton.type = 'button';
      backButton.setAttribute('aria-label', 'Back to token details');
      if (headerClone) {
        headerClone.style.background = '#000';
        const titleNode = makeText(title, {
          color: '#fff',
          fontSize: '18px',
          fontWeight: '500',
          lineHeight: '24px',
          fontFamily: 'Geist, sans-serif',
        });
        Object.assign(titleNode.style, {
          position: 'absolute',
          left: '56px',
          right: '56px',
          textAlign: 'center',
          pointerEvents: 'none',
        });
        headerClone.style.position = 'relative';
        headerClone.append(titleNode);
        header.append(headerClone);
        const clonedBack =
          headerClone.querySelector<HTMLElement>('img[alt="back"]')?.closest(
            'button',
          ) ?? headerClone.querySelector<HTMLButtonElement>('button');
        if (clonedBack) {
          backButton = clonedBack as HTMLButtonElement;
          backButton.setAttribute('aria-label', 'Back to token details');
        }
      } else {
        Object.assign(backButton.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          padding: '4px',
          border: '0',
          background: 'transparent',
          color: '#fff',
          cursor: 'pointer',
        });
        backButton.append(makeMaterialIcon('chevron_left', 20, '#fff'));
        header.append(
          backButton,
          makeText(title, {
            color: '#fff',
            fontSize: '18px',
            fontWeight: '500',
            lineHeight: '24px',
          }),
        );
      }
      return { header, backButton };
    };
    const makeSwapBuyFooter = (disclaimer?: string) => {
      const footer = frameDocument.createElement('footer');
      Object.assign(footer.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexShrink: '0',
        padding: '12px 16px 16px',
        boxSizing: 'border-box',
        background: '#000',
      });
      const homeSwap = Array.from(
        frameDocument.querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => {
        const text = button.textContent?.replace(/\s+/g, ' ').trim();
        return (
          text === 'Swap' ||
          text === 'Convert' ||
          Boolean(text?.endsWith('Swap')) ||
          Boolean(text?.endsWith('Convert'))
        );
      });
      const homeFooterRow = homeSwap?.parentElement;
      if (homeFooterRow) {
        const clonedFooter = homeFooterRow.cloneNode(true) as HTMLElement;
        clonedFooter.querySelectorAll('button').forEach((button) => {
          button.setAttribute('type', 'button');
          const label = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const isSwapOrBuy =
            label === 'Swap' ||
            label === 'Convert' ||
            label === 'Buy' ||
            label.endsWith('Swap') ||
            label.endsWith('Convert') ||
            label.endsWith('Buy');
          if (!isSwapOrBuy) button.remove();
        });
        renameConvertToSwap(clonedFooter);
        Object.assign(clonedFooter.style, {
          paddingLeft: '0',
          paddingRight: '0',
          margin: '0',
          width: '100%',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        });
        footer.append(clonedFooter);
      } else {
        const actionRow = frameDocument.createElement('div');
        Object.assign(actionRow.style, {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        });
        const makeAction = (label: string, filled: boolean) => {
          const button = frameDocument.createElement('button');
          button.type = 'button';
          Object.assign(button.style, {
            height: '48px',
            border: filled ? '0' : '1px solid #BAF24A',
            borderRadius: '999px',
            background: filled ? '#BAF24A' : 'transparent',
            color: filled ? '#131416' : '#BAF24A',
            fontSize: '16px',
            fontWeight: '500',
            lineHeight: '20px',
            cursor: 'pointer',
          });
          button.textContent = label;
          return button;
        };
        actionRow.append(makeAction('Swap', false), makeAction('Buy', true));
        footer.append(actionRow);
      }
      if (disclaimer) {
        footer.append(
          makeText(disclaimer, {
            color: '#9B9B9B',
            fontSize: '10px',
            fontWeight: '400',
            lineHeight: '14px',
            textAlign: 'center',
          }),
        );
      }
      return footer;
    };

    const insightsPage = makeSlidePage('Market Insights');

    const makeBrandLogo = (
      brand: 'coindesk' | 'tradingview' | 'bloomberg' | 'reuters',
    ) => {
      const wrap = frameDocument.createElement('span');
      Object.assign(wrap.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        flexShrink: '0',
        borderRadius: '50%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: '1.5px solid #000',
        background:
          brand === 'coindesk'
            ? '#F5C518'
            : brand === 'tradingview'
              ? '#2962FF'
              : brand === 'bloomberg'
                ? '#2800D7'
                : '#FF8000',
      });
      wrap.innerHTML =
        brand === 'coindesk'
          ? `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="#111" d="M13.1 6.4c-3.6 0-5.7 2.2-5.7 5.6s2.1 5.6 5.7 5.6c1.9 0 3.4-.7 4.4-1.8l-1.6-1.4c-.7.7-1.6 1.1-2.7 1.1-1.8 0-3-1.3-3-3.5s1.2-3.5 3-3.5c1.1 0 2 .4 2.7 1.1l1.6-1.4c-1-1.1-2.5-1.8-4.4-1.8z"/></svg>`
          : brand === 'tradingview'
            ? `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="#fff" d="M15.8654 8.2789c0 1.3541-1.0978 2.4519-2.452 2.4519-1.354 0-2.4519-1.0978-2.4519-2.452 0-1.354 1.0978-2.4518 2.452-2.4518 1.3541 0 2.4519 1.0977 2.4519 2.4519zM9.75 6H0v4.9038h4.8462v7.2692H9.75Zm8.5962 0H24l-5.1058 12.173h-5.6538z"/></svg>`
            : brand === 'bloomberg'
              ? `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="#fff" d="M7 5h7.2c2.7 0 4.3 1.4 4.3 3.5 0 1.4-.8 2.5-2.1 3 1.6.4 2.6 1.6 2.6 3.3 0 2.3-1.8 3.7-4.6 3.7H7V5zm3.2 5.4h3.3c1.1 0 1.7-.5 1.7-1.3s-.6-1.3-1.7-1.3h-3.3v2.6zm0 5.5h3.7c1.2 0 1.9-.5 1.9-1.4s-.7-1.4-1.9-1.4h-3.7v2.8z"/></svg>`
              : `<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="#fff" d="M7.2 6.2h6.4c2.6 0 4.3 1.5 4.3 3.7 0 1.6-.9 2.8-2.3 3.3L19 17.8h-3.5l-3.1-4.3H10.4v4.3H7.2V6.2zm3.2 2.4v3.3h2.8c1.1 0 1.8-.5 1.8-1.6s-.7-1.7-1.8-1.7h-2.8z"/></svg>`;
      return wrap;
    };
    const makeSourceCredit = (
      brands: Array<'coindesk' | 'tradingview' | 'bloomberg' | 'reuters'>,
      label: string,
    ) => {
      const row = frameDocument.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '-8px',
        marginBottom: '16px',
      });
      const stack = frameDocument.createElement('div');
      Object.assign(stack.style, {
        display: 'flex',
        alignItems: 'center',
        flexShrink: '0',
      });
      brands.slice(0, 4).forEach((brand, index) => {
        const avatar = makeBrandLogo(brand);
        avatar.style.position = 'relative';
        avatar.style.zIndex = String(10 - index);
        if (index > 0) avatar.style.marginLeft = '-6px';
        stack.append(avatar);
      });
      row.append(stack);
      row.append(
        makeText(label, {
          color: '#9B9B9B',
          fontSize: '10px',
          fontWeight: '400',
          lineHeight: '14px',
        }),
      );
      return row;
    };

    const { header: insightsHeader, backButton: insightsBackButton } =
      makeSubpageHeader('Market Insights');

    const insightsContent = frameDocument.createElement('div');
    Object.assign(insightsContent.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '16px',
      boxSizing: 'border-box',
      scrollbarWidth: 'none',
    });

    const insightVideo = frameDocument.createElement('video');
    insightVideo.src = `${import.meta.env.BASE_URL}insights-banner.mp4`;
    insightVideo.muted = true;
    insightVideo.playsInline = true;
    insightVideo.setAttribute('playsinline', '');
    insightVideo.setAttribute('webkit-playsinline', '');
    insightVideo.preload = 'auto';
    insightVideo.controls = false;
    insightVideo.disablePictureInPicture = true;
    Object.assign(insightVideo.style, {
      width: 'calc(100% + 32px)',
      height: '132px',
      margin: '0 -16px 20px',
      maxWidth: 'none',
      objectFit: 'cover',
      background: '#000',
      display: 'block',
      border: '0',
    });
    insightsContent.append(insightVideo);

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
      makeSourceCredit(['coindesk'], 'CoinDesk'),
      makeInsightSection(
        'Weak jobs data',
        'Today’s ADP report showed private payrolls rose by only 22,000 in January, missing expectations. This signals a lackluster economic start to 2026, dampening investor appetite for risk.',
      ),
      makeSourceCredit(
        ['tradingview', 'coindesk', 'bloomberg'],
        'TradingView +2',
      ),
      makeInsightSection(
        'Fed uncertainty',
        'Today’s ADP report showed private payrolls rose by only 22,000 in January, missing expectations. This signals a lackluster economic start to 2026, dampening investor appetite for risk.',
      ),
      makeSourceCredit(
        ['coindesk', 'tradingview', 'bloomberg', 'reuters'],
        'TradingView +3',
      ),
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
        background: BG_SUBSECTION,
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
        '@eth_taco · 1mo ago',
      ),
      makeSocialCard(
        'This is the best chart in #Crypto #Bitcoin\n\nThe representation of the current status of the markets can’t be explained by a better chart.',
        '@CryptoMichNL · 1mo ago',
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
    [makeFontIcon('thumb_up', 20, '#9B9B9B'), makeFontIcon('thumb_down', 20, '#9B9B9B')].forEach(
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

    const insightsActions = makeSwapBuyFooter(
      'AI summary for information only',
    );

    insightsPage.append(insightsHeader, insightsContent, insightsActions);
    phoneScreen.append(insightsPage);
    addedPositionNodes.push(insightsPage);

    const securityPage = makeSlidePage('Security and trust');
    const { header: securityHeader, backButton: securityBackButton } =
      makeSubpageHeader('Security and trust');
    const securityContent = frameDocument.createElement('div');
    Object.assign(securityContent.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '16px',
      boxSizing: 'border-box',
      scrollbarWidth: 'none',
    });
    const makeSecurityDivider = () => {
      const divider = frameDocument.createElement('div');
      Object.assign(divider.style, {
        height: '1px',
        margin: '24px -16px',
        background: 'rgba(180, 180, 181, 0.16)',
      });
      return divider;
    };
    const makeCheckRow = (label: string) => {
      const row = frameDocument.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginTop: '16px',
      });
      row.append(
        makeFontIcon('check_circle', 20, '#BAF24A'),
        makeText(label, {
          color: '#fff',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '22px',
        }),
      );
      return row;
    };
    const makeInfoCell = (label: string, value: string) => {
      const cell = frameDocument.createElement('div');
      cell.append(
        makeText(label, {
          color: '#9B9B9B',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '20px',
        }),
        makeText(value, {
          marginTop: '4px',
          color: '#fff',
          fontSize: '16px',
          fontWeight: '500',
          lineHeight: '22px',
        }),
      );
      return cell;
    };
    const makeLinkChip = (
      label: string,
      href: string,
      icon: HTMLElement,
    ) => {
      const link = frameDocument.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      Object.assign(link.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        minHeight: '40px',
        padding: '8px 14px',
        borderRadius: '999px',
        background: BG_SUBSECTION,
        color: '#fff',
        fontSize: '14px',
        fontWeight: '500',
        lineHeight: '20px',
        textDecoration: 'none',
        boxSizing: 'border-box',
      });
      link.append(icon, frameDocument.createTextNode(label));
      return link;
    };

    securityContent.append(
      makeText('Verified', {
        color: '#BAF24A',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makeText(
        'No risk signals detected. Always research any asset before trading.',
        {
          marginTop: '8px',
          color: '#9B9B9B',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '22px',
        },
      ),
      makeCheckRow('High trading volume'),
      makeCheckRow('Established reputation'),
      makeCheckRow('Listed on exchange'),
      makeCheckRow('Published contract'),
      makeSecurityDivider(),
    );

    securityContent.append(
      makeText('Token distribution', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
      makeText('Total supply', {
        marginTop: '12px',
        color: '#9B9B9B',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '20px',
      }),
      makeText('120.70M ETH', {
        marginTop: '4px',
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
    );
    const distributionTrack = frameDocument.createElement('div');
    Object.assign(distributionTrack.style, {
      position: 'relative',
      width: '100%',
      height: '6px',
      marginTop: '16px',
      borderRadius: '999px',
      background: BG_SUBSECTION,
      overflow: 'hidden',
    });
    const distributionFill = frameDocument.createElement('div');
    Object.assign(distributionFill.style, {
      width: '38.2%',
      height: '100%',
      borderRadius: '999px',
      background: PRIMARY_BLUE,
    });
    distributionTrack.append(distributionFill);
    securityContent.append(distributionTrack);
    const makeLegendRow = (
      color: string,
      label: string,
      value: string,
    ) => {
      const row = frameDocument.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginTop: '12px',
      });
      const left = frameDocument.createElement('div');
      Object.assign(left.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: '0',
      });
      const dot = frameDocument.createElement('span');
      Object.assign(dot.style, {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: color,
        flex: '0 0 8px',
      });
      left.append(
        dot,
        makeText(label, {
          color: '#fff',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '22px',
        }),
      );
      row.append(
        left,
        makeText(value, {
          color: '#fff',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '22px',
        }),
      );
      return row;
    };
    securityContent.append(
      makeLegendRow(PRIMARY_BLUE, 'Top 10 holders', '38.2%'),
      makeLegendRow('#6B6B6B', 'Other', '61.8%'),
    );

    securityContent.append(
      makeText('Buy/Sell Tax', {
        marginTop: '28px',
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
    );
    const taxRow = frameDocument.createElement('div');
    Object.assign(taxRow.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      marginTop: '12px',
      columnGap: '12px',
    });
    ['0.0%', '0.0%', '0.0%'].forEach((value) => {
      taxRow.append(
        makeText(value, {
          color: '#fff',
          fontSize: '24px',
          fontWeight: '500',
          lineHeight: '28px',
        }),
      );
    });
    const taxLabels = frameDocument.createElement('div');
    Object.assign(taxLabels.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      marginTop: '4px',
      columnGap: '12px',
    });
    ['Buy tax', 'Sell tax', 'Transfer'].forEach((label) => {
      taxLabels.append(
        makeText(label, {
          color: '#9B9B9B',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '20px',
        }),
      );
    });
    securityContent.append(taxRow, taxLabels);
    const feesPill = frameDocument.createElement('div');
    Object.assign(feesPill.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      marginTop: '16px',
      padding: '6px 10px',
      borderRadius: '999px',
      background: 'rgba(186, 242, 74, 0.12)',
    });
    feesPill.append(
      makeFontIcon('verified_user', 16, '#BAF24A'),
      makeText('No hidden fees detected', {
        color: '#BAF24A',
        fontSize: '14px',
        fontWeight: '500',
        lineHeight: '18px',
      }),
    );
    securityContent.append(feesPill, makeSecurityDivider());

    securityContent.append(
      makeText('Token Info', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
    );
    const infoGrid = frameDocument.createElement('div');
    Object.assign(infoGrid.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      rowGap: '20px',
      columnGap: '16px',
      marginTop: '16px',
    });
    infoGrid.append(
      makeInfoCell('Created', 'Thu Jul 30 2015'),
      makeInfoCell('Token age', '11 yr'),
      makeInfoCell('Network', 'Ethereum'),
      makeInfoCell('Type', 'Native'),
    );
    securityContent.append(infoGrid, makeSecurityDivider());

    securityContent.append(
      makeText('Official links', {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '500',
        lineHeight: '24px',
      }),
    );
    const linksWrap = frameDocument.createElement('div');
    Object.assign(linksWrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginTop: '16px',
    });
    linksWrap.append(
      makeLinkChip(
        'Website',
        'https://ethereum.org',
        makeFontIcon('language', 16, '#fff'),
      ),
      makeLinkChip(
        'X @ethereum',
        'https://x.com/ethereum',
        makeFontIcon('alternate_email', 16, '#fff'),
      ),
      makeLinkChip(
        'Telegram',
        'https://t.me/ethereum',
        makeFontIcon('send', 16, '#fff'),
      ),
      makeLinkChip(
        'Etherscan',
        'https://etherscan.io',
        makeFontIcon('travel_explore', 16, '#fff'),
      ),
    );
    securityContent.append(linksWrap);
    securityContent.append(
      makeText(
        'This security review is for evaluation only and does not constitute an endorsement or recommendation to trade.',
        {
          marginTop: '32px',
          marginBottom: '8px',
          color: '#9B9B9B',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '20px',
          textAlign: 'center',
        },
      ),
    );

    const securityActions = makeSwapBuyFooter();
    securityPage.append(securityHeader, securityContent, securityActions);
    phoneScreen.append(securityPage);
    addedPositionNodes.push(securityPage);

    let pageCloseTimer: number | undefined;
    const hideSlidePage = (page: HTMLElement, afterHide?: () => void) => {
      page.style.transform = 'translateX(100%)';
      page.setAttribute('aria-hidden', 'true');
      pageCloseTimer = frameDocument.defaultView?.setTimeout(() => {
        page.style.display = 'none';
        const otherOpen =
          (page !== insightsPage && insightsPage.style.display === 'flex') ||
          (page !== securityPage && securityPage.style.display === 'flex');
        if (!otherOpen) phoneScreen.style.overflow = '';
        afterHide?.();
      }, 280);
    };
    const showSlidePage = (page: HTMLElement, beforeShow?: () => void) => {
      if (pageCloseTimer !== undefined) {
        frameDocument.defaultView?.clearTimeout(pageCloseTimer);
      }
      if (page !== insightsPage) {
        insightsPage.style.display = 'none';
        insightsPage.style.transform = 'translateX(100%)';
        insightsPage.setAttribute('aria-hidden', 'true');
        insightVideo.pause();
      }
      if (page !== securityPage) {
        securityPage.style.display = 'none';
        securityPage.style.transform = 'translateX(100%)';
        securityPage.setAttribute('aria-hidden', 'true');
      }
      page.style.display = 'flex';
      page.setAttribute('aria-hidden', 'false');
      phoneScreen.style.overflow = 'hidden';
      beforeShow?.();
      frameDocument.defaultView?.requestAnimationFrame(() => {
        page.style.transform = 'translateX(0)';
      });
    };
    const closeInsightsPage = () => hideSlidePage(insightsPage, () => insightVideo.pause());
    const openInsightsPage = () =>
      showSlidePage(insightsPage, () => {
        insightVideo.pause();
        insightVideo.currentTime = 0;
        void insightVideo.play().catch(() => undefined);
      });
    const closeSecurityPage = () => hideSlidePage(securityPage);
    const openSecurityPage = () => showSlidePage(securityPage);

    insightsBackButton.addEventListener('click', closeInsightsPage);
    securityBackButton.addEventListener('click', closeSecurityPage);
    const securityOpenButton = Array.from(
      frameDocument.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) =>
      (button.textContent ?? '').includes('Security and trust'),
    );
    securityOpenButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSecurityPage();
    });
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
    marginTop: element.style.marginTop,
    marginBottom: element.style.marginBottom,
    marginLeft: element.style.marginLeft,
  }));
  fullWidthDividers.forEach(styleDivider);

  const dividerAfterActions = actionMenu?.nextElementSibling as HTMLElement | null;
  const yourPositionSection =
    dividerAfterActions?.nextElementSibling as HTMLElement | null;
  const dividerAfterPosition =
    yourPositionSection?.nextElementSibling as HTMLElement | null;
  const securitySection =
    dividerAfterPosition?.nextElementSibling as HTMLElement | null;
  clearSectionTopMargin(securitySection);
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
  clearSectionTopMargin(aboutSection);
  const statsHeading = Array.from(
    frameDocument.querySelectorAll<HTMLElement>('h3'),
  ).find((heading) => heading.textContent?.trim() === 'Stats');
  clearSectionTopMargin(
    statsHeading?.closest('div.px-4.mt-5') as HTMLElement | null,
  );
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
    clearSectionTopMargin(yourPositionSection);
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
    const insightsArrow = marketInsightsBanner.querySelector(
      '.quick-swap-insights-arrow',
    );
    const securityArrowSvg = securitySection?.querySelector<SVGSVGElement>(
      'button svg',
    );
    if (insightsArrow && securityArrowSvg) {
      const clonedArrow = securityArrowSvg.cloneNode(true) as SVGSVGElement;
      clonedArrow.classList.add('quick-swap-insights-arrow');
      clonedArrow.setAttribute('aria-hidden', 'true');
      clonedArrow.querySelectorAll('path, polyline, line').forEach((node) => {
        const el = node as SVGElement;
        const stroke = el.getAttribute('stroke');
        const fill = el.getAttribute('fill');
        if (stroke && stroke !== 'none') el.setAttribute('stroke', '#9B9B9B');
        if (fill && fill !== 'none') el.setAttribute('fill', '#9B9B9B');
      });
      insightsArrow.replaceWith(clonedArrow);
    }
    actionMenu.parentNode.insertBefore(
      marketInsightsBanner,
      dividerAfterActions,
    );
    addedPositionNodes.push(marketInsightsBanner);
  }

  if (securitySection?.parentNode) {
    const perpsSection = frameDocument.createElement('div');
    perpsSection.className = 'px-4';
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
    earningsSection.className = 'px-4';
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
        background: BG_SECTION,
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
  chartRegion.style.paddingLeft = '0';
  chartRegion.style.paddingRight = '0';
  chartRegion.style.background = '#000';
  // LWC right scale insets labels from the canvas edge
  // (paddingOuter + LabelOffset, ~13px at 11px font, plus a 1px axis cell).
  const SCREEN_EDGE_INSET = 16;
  const LWC_PRICE_LABEL_INSET = 14;
  const chartHost = frameDocument.createElement('div');
  Object.assign(chartHost.style, {
    width: '100%',
    height: '240px',
    minHeight: '240px',
    position: 'relative',
    boxSizing: 'border-box',
    background: '#000',
    paddingRight: `${Math.max(0, SCREEN_EDGE_INSET - LWC_PRICE_LABEL_INSET)}px`,
  });
  const chartInner = frameDocument.createElement('div');
  Object.assign(chartInner.style, {
    width: '100%',
    height: '240px',
    background: '#000',
  });
  chartHost.append(chartInner);
  chartRegion.append(chartHost);

  let activeTimeframe: Timeframe = '1H';
  let { lineData, candleData } = buildChartData(activeTimeframe);
  const chart = createChart(chartInner, {
    width: chartInner.clientWidth,
    height: 240,
    layout: {
      background: { type: ColorType.Solid, color: '#000' },
      textColor: '#9b9b9b',
      fontFamily: 'Geist, Inter, sans-serif',
      fontSize: 12,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(255,255,255,0.24)',
        labelVisible: false,
      },
      horzLine: {
        color: 'rgba(255,255,255,0.24)',
        labelVisible: false,
      },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.12, bottom: 0.12 },
      minimumWidth: 0,
      ticksVisible: false,
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
  const livePrice = LIVE_PRICE;
  const formatHeaderPrice = (price: number) =>
    `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const setHeaderPrice = (price: number) => {
    if (headerPrice) headerPrice.textContent = formatHeaderPrice(price);
  };
  const formatUsd = (price: number) =>
    `$${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const formatVolume = (volume: number) => {
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(2)}M`;
    if (volume >= 1_000) return `$${Math.round(volume / 1_000)}K`;
    return `$${Math.round(volume)}`;
  };
  const formatChange = (open: number, close: number) => {
    const change = ((close - open) / open) * 100;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };
  const formatAxisTime = (time: UTCTimestamp) => {
    const date = new Date(time * 1000);
    const day = date.getUTCDate();
    const month = date.toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    const year = String(date.getUTCFullYear()).slice(-2);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} '${year} ${hours}:${minutes}`;
  };
  const makeChartTag = (background: string, color: string) => {
    const tag = frameDocument.createElement('div');
    tag.className = 'quick-swap-chart-tag';
    Object.assign(tag.style, { background, color, display: 'none' });
    chartHost.append(tag);
    return tag;
  };
  const lastPriceTag = makeChartTag('#BAF24A', BG_DEFAULT);
  const crosshairPriceTag = makeChartTag(BG_SUBSECTION, '#FFFFFF');
  const crosshairTimeTag = makeChartTag(BG_SUBSECTION, '#FFFFFF');
  const ohlcOverlay = frameDocument.createElement('div');
  ohlcOverlay.className = 'quick-swap-ohlc';
  const ohlcLeftCol = frameDocument.createElement('div');
  ohlcLeftCol.className = 'quick-swap-ohlc-col';
  const ohlcRightCol = frameDocument.createElement('div');
  ohlcRightCol.className = 'quick-swap-ohlc-col quick-swap-ohlc-col-end';
  ohlcOverlay.append(ohlcLeftCol, ohlcRightCol);
  const ohlcFields = [
    ['Open', ohlcLeftCol],
    ['Low', ohlcRightCol],
    ['Close', ohlcLeftCol],
    ['High', ohlcRightCol],
    ['Volume', ohlcLeftCol],
    ['Change', ohlcRightCol],
  ] as const;
  const ohlcValues = Object.fromEntries(
    ohlcFields.map(([field, column]) => {
      const item = frameDocument.createElement('div');
      item.className = 'quick-swap-ohlc-item';
      const label = frameDocument.createElement('span');
      label.textContent = field;
      const value = frameDocument.createElement('span');
      item.append(label, value);
      column.append(item);
      return [field, value];
    }),
  ) as Record<(typeof ohlcFields)[number][0], HTMLElement>;
  const priceSlot = frameDocument.createElement('div');
  priceSlot.className = 'quick-swap-price-slot';
  if (priceBlock?.parentNode) {
    priceBlock.parentNode.insertBefore(priceSlot, priceBlock);
    priceSlot.append(ohlcOverlay, priceBlock);
  } else {
    chartHost.append(priceSlot);
    priceSlot.append(ohlcOverlay);
  }
  Object.assign(priceSlot.style, {
    position: 'relative',
    overflow: 'visible',
    flexShrink: '0',
  });
  const pinOhlcToScreen = () => {
    const paddedParent = priceSlot.parentElement;
    if (!paddedParent) return;
    const styles = frameDocument.defaultView?.getComputedStyle(paddedParent);
    const padLeft = Number.parseFloat(styles?.paddingLeft ?? '0') || 0;
    const padRight = Number.parseFloat(styles?.paddingRight ?? '0') || 0;
    ohlcOverlay.style.position = 'absolute';
    ohlcOverlay.style.top = '0';
    ohlcOverlay.style.bottom = '0';
    ohlcOverlay.style.left = `${-padLeft}px`;
    ohlcOverlay.style.right = `${-padRight}px`;
    ohlcOverlay.style.width = 'auto';
    ohlcOverlay.style.height = '100%';
    ohlcOverlay.style.maxWidth = 'none';
    ohlcOverlay.style.margin = '0';
    ohlcOverlay.style.paddingTop = '12px';
    ohlcOverlay.style.paddingLeft = '16px';
    ohlcOverlay.style.paddingRight = '16px';
    ohlcOverlay.style.paddingBottom = '0';
    ohlcOverlay.style.boxSizing = 'border-box';
  };
  pinOhlcToScreen();
  let lastCrosshairParam: MouseEventParams | undefined;

  const updateOhlcOverlay = (
    candle?: (typeof candleData)[number],
  ) => {
    const showOhlc = activeMode === 'candles' && Boolean(candle);
    if (priceBlock) {
      priceBlock.style.display = originalPriceBlockDisplay;
      priceBlock.style.visibility = showOhlc ? 'hidden' : originalPriceBlockVisibility;
    }
    if (!showOhlc || !candle) {
      ohlcOverlay.style.display = 'none';
      return;
    }

    ohlcOverlay.style.display = 'grid';
    pinOhlcToScreen();
    ohlcValues.Open.textContent = formatUsd(candle.open);
    ohlcValues.Low.textContent = formatUsd(candle.low);
    ohlcValues.Close.textContent = formatUsd(candle.close);
    ohlcValues.High.textContent = formatUsd(candle.high);
    ohlcValues.Volume.textContent = formatVolume(candle.volume);
    ohlcValues.Change.textContent = formatChange(candle.open, candle.close);
    ohlcValues.Change.style.color =
      candle.close >= candle.open ? '#BAF24A' : '#F0747A';
  };

  const placePriceTag = (tag: HTMLElement, y: number) => {
    tag.style.display = 'block';
    tag.style.left = 'auto';
    tag.style.width = 'auto';
    tag.style.right = '12px';
    tag.style.top = `${y}px`;
    tag.style.transform = 'translateY(-50%)';
    tag.style.textAlign = 'right';
    tag.style.padding = '1px 4px';
    tag.style.fontSize = '12px';
    tag.style.fontWeight = '400';
    tag.style.lineHeight = '14px';
    tag.style.fontFamily = 'Geist, Inter, sans-serif';
  };

  const updateChartTags = (param?: MouseEventParams) => {
    if (!activeSeries) return;

    const pane = chart.paneSize();
    const lastY = activeSeries.priceToCoordinate(livePrice);
    if (lastY === null) {
      lastPriceTag.style.display = 'none';
    } else {
      lastPriceTag.textContent = formatUsd(livePrice).replace('$', '');
      placePriceTag(lastPriceTag, lastY);
    }

    const hoveredCandle =
      param?.time !== undefined
        ? candleData.find((candle) => candle.time === param.time)
        : undefined;
    updateOhlcOverlay(hoveredCandle ?? candleData[candleData.length - 1]);

    const hovered = param?.seriesData.get(activeSeries) as
      | { value?: number; close?: number }
      | undefined;
    const hoveredPrice = hovered?.value ?? hovered?.close;
    if (
      !param?.point ||
      param.time === undefined ||
      hoveredPrice === undefined
    ) {
      setHeaderPrice(livePrice);
      crosshairPriceTag.style.display = 'none';
      crosshairTimeTag.style.display = 'none';
      return;
    }

    setHeaderPrice(hoveredPrice);
    crosshairPriceTag.textContent = formatUsd(hoveredPrice).replace('$', '');
    placePriceTag(crosshairPriceTag, param.point.y);
    crosshairTimeTag.textContent = formatAxisTime(param.time as UTCTimestamp);
    crosshairTimeTag.style.display = 'block';
    const timeAxisHeight = Math.max(chartHost.clientHeight - pane.height, 0);
    crosshairTimeTag.style.left = `${param.point.x}px`;
    crosshairTimeTag.style.top = `${pane.height + timeAxisHeight / 2}px`;
    crosshairTimeTag.style.transform = 'translate(-50%, -50%)';
  };
  const isLineScrubbing = () =>
    activeMode === 'line' &&
    Boolean(lastCrosshairParam?.point && lastCrosshairParam.time !== undefined);

  const updateHeaderPrice = (param: MouseEventParams) => {
    lastCrosshairParam = param.point ? param : undefined;
    updateLiveDot();
  };

  const pointerCursorStyle = frameDocument.createElement('style');
  const tapCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='11' fill='rgba(255,255,255,0.25)'/></svg>",
  )}") 16 16, pointer`;
  pointerCursorStyle.textContent = `
    html,
    body,
    body * {
      cursor: ${tapCursor} !important;
    }
  `;
  frameDocument.head.append(pointerCursorStyle);

  const restyleActionButtons = () => {
    const actions = [
      { label: 'Buy', icon: 'add' },
      { label: 'Send', icon: 'north_east' },
      { label: 'Receive', icon: 'qr_code' },
      { label: 'More', icon: 'more_horiz' },
    ] as const;

    actionButtons.forEach((button, index) => {
      const action = actions[index];
      if (!action) return;
      const icon = makeMaterialIcon(action.icon, 24, '#9B9B9B');
      const label = frameDocument.createElement('span');
      label.textContent = action.label;
      Object.assign(button.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
      });
      button.replaceChildren(icon, label);
      button.setAttribute('aria-label', action.label);
    });
  };
  restyleActionButtons();

  const pulseStyle = frameDocument.createElement('style');
  pulseStyle.textContent = `
    @keyframes quick-swap-live-pulse {
      0% {
        transform: scale(1);
        opacity: 0.55;
      }
      100% {
        transform: scale(2.6);
        opacity: 0;
      }
    }
    .quick-swap-live-dot::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 999px;
      border: 1.5px solid rgba(186, 242, 74, 0.8);
      animation: quick-swap-live-pulse 2s ease-out infinite;
      pointer-events: none;
    }
    .quick-swap-chart-tag {
      position: absolute;
      z-index: 4;
      padding: 1px 4px;
      border-radius: 4px;
      font-family: Geist, Inter, sans-serif;
      font-size: 12px;
      font-weight: 400;
      line-height: 14px;
      letter-spacing: 0;
      white-space: nowrap;
      pointer-events: none;
      box-sizing: border-box;
    }
    .quick-swap-ohlc {
      display: none;
      box-sizing: border-box;
      height: 100%;
      min-height: 100%;
      padding: 12px 16px 0;
      grid-template-columns: 1fr 1fr;
      column-gap: 0;
      row-gap: 0;
      align-content: stretch;
      font-family: Geist, Inter, sans-serif;
    }
    .quick-swap-ohlc-col {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }
    .quick-swap-ohlc-col-end {
      align-items: flex-start;
    }
    .quick-swap-ohlc-col-end .quick-swap-ohlc-item {
      justify-content: flex-start;
    }
    .quick-swap-ohlc-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      white-space: nowrap;
    }
    .quick-swap-ohlc-item span:first-child {
      color: #9B9B9B;
      font-size: 13px;
      font-weight: 400;
      line-height: 16px;
    }
    .quick-swap-ohlc-item span:last-child {
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      line-height: 16px;
    }
  `;
  frameDocument.head.append(pulseStyle);

  const liveDot = frameDocument.createElement('span');
  liveDot.className = 'quick-swap-live-dot';
  liveDot.setAttribute('aria-label', 'Live chart data');
  Object.assign(liveDot.style, {
    position: 'absolute',
    zIndex: '3',
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#BAF24A',
    border: '2px solid #000',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    display: 'none',
  });
  chartHost.append(liveDot);

  const updateLiveDot = () => {
    if (!activeSeries || activeMode !== 'line' || isLineScrubbing()) {
      liveDot.style.display = 'none';
      updateChartTags(lastCrosshairParam);
      return;
    }

    const lastPoint = lineData[lineData.length - 1];
    const x = chart.timeScale().timeToCoordinate(lastPoint.time);
    const y = activeSeries.priceToCoordinate(lastPoint.value);

    if (x === null || y === null) {
      liveDot.style.display = 'none';
      updateChartTags(lastCrosshairParam);
      return;
    }

    liveDot.style.left = `${x}px`;
    liveDot.style.top = `${y}px`;
    liveDot.style.display = 'block';
    updateChartTags(lastCrosshairParam);
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
        crosshairMarkerBorderColor: '#000',
        crosshairMarkerBackgroundColor: '#BAF24A',
        priceLineVisible: true,
        priceLineColor: 'rgba(186,242,74,0.45)',
        priceLineStyle: 2,
        lastValueVisible: false,
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
        lastValueVisible: false,
      });
      series.setData(candleData);
      activeSeries = series;
    }

    updateChartModeIcon();
    chart.timeScale().fitContent();
    frameDocument.defaultView?.requestAnimationFrame(() => {
      updateLiveDot();
      updateChartTags(lastCrosshairParam);
      updateOhlcOverlay(
        lastCrosshairParam?.time !== undefined
          ? candleData.find((candle) => candle.time === lastCrosshairParam?.time)
          : candleData[candleData.length - 1],
      );
    });
  };

  const applyTimeframeStyles = (timeframe: Timeframe) => {
    timeframeButtons.forEach((button) => {
      const isActive = button.textContent?.trim() === timeframe;
      button.style.background = isActive ? 'rgb(186, 242, 74)' : 'transparent';
      button.style.color = isActive ? 'rgb(19, 20, 22)' : 'rgb(186, 242, 74)';
      button.setAttribute('aria-pressed', String(isActive));
    });
  };

  const applyTimeframe = (timeframe: Timeframe) => {
    activeTimeframe = timeframe;
    const nextData = buildChartData(timeframe);
    lineData = nextData.lineData;
    candleData = nextData.candleData;
    const config = TIMEFRAME_CONFIG[timeframe];
    chart.timeScale().applyOptions({
      timeVisible: config.timeVisible,
      barSpacing: config.barSpacing,
    });
    applyTimeframeStyles(timeframe);
    showSeries(activeMode);
  };

  const handleTimeframeClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const timeframe = button.textContent?.trim() as Timeframe;
    if (!TIMEFRAMES.includes(timeframe)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    applyTimeframe(timeframe);
  };

  timeframeButtons.forEach((button) => {
    button.addEventListener('click', handleTimeframeClick, true);
  });

  const toggleChartMode = () =>
    showSeries(activeMode === 'line' ? 'candles' : 'line');
  chartModeButton?.addEventListener('click', toggleChartMode);
  applyTimeframe('1H');
  chart.timeScale().subscribeVisibleLogicalRangeChange(updateLiveDot);
  chart.subscribeCrosshairMove(updateHeaderPrice);

  const resizeObserver = new ResizeObserver(() => {
    chart.applyOptions({ width: Math.floor(chartInner.clientWidth) });
    updateLiveDot();
    updateChartTags(lastCrosshairParam);
  });
  resizeObserver.observe(chartInner);

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
    timeframeButtons.forEach((button) => {
      button.removeEventListener('click', handleTimeframeClick, true);
    });
    chartModeButton?.removeEventListener('click', toggleChartMode);
    if (chartModeButton) {
      chartModeButton.replaceChildren(
        ...originalChartIcon.map((node) => node.cloneNode(true)),
      );
      chartModeButton.setAttribute('aria-label', 'Indicators');
    }
    originalActionChildren.forEach(({ button, nodes, ariaLabel }) => {
      button.replaceChildren(...nodes.map((node) => node.cloneNode(true)));
      if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
      else button.removeAttribute('aria-label');
    });
    originalDividerStyles.forEach(
      ({ element, width, marginTop, marginBottom, marginLeft }) => {
        element.style.width = width;
        element.style.marginTop = marginTop;
        element.style.marginBottom = marginBottom;
        element.style.marginLeft = marginLeft;
      },
    );
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
    lastPriceTag.remove();
    crosshairPriceTag.remove();
    crosshairTimeTag.remove();
    if (priceBlock && priceSlot.parentNode) {
      priceSlot.parentNode.insertBefore(priceBlock, priceSlot);
      priceBlock.style.display = originalPriceBlockDisplay;
      priceBlock.style.visibility = originalPriceBlockVisibility;
    }
    priceSlot.remove();
    ohlcOverlay.remove();
    pulseStyle.remove();
    materialIconLink.remove();
    pointerCursorStyle.remove();
    chart.remove();
  };
}

export function waitForTradingViewChart(
  frame: { contentDocument: Document | null },
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

