import React from 'react';

/**
 * Yerel çizgi ikon seti.
 *
 * Emoji yerine kullanılır: emoji platformdan platforma farklı çizilir,
 * renk kontrolü yoktur ve arayüzü oyuncaklaştırır. Bunlar 24x24 ızgarada,
 * 1.5px çizgi kalınlığında, currentColor ile boyanan sade ikonlardır —
 * yani metin rengini miras alırlar.
 */

export type IconName =
  | 'home' | 'box' | 'book' | 'chart' | 'camera' | 'snowflake' | 'cabinet'
  | 'bell' | 'alert' | 'check' | 'close' | 'chevronRight' | 'chevronLeft'
  | 'search' | 'plus' | 'minus' | 'trash' | 'edit' | 'sliders' | 'download'
  | 'upload' | 'send' | 'cap' | 'user' | 'store' | 'shield' | 'flash'
  | 'lock' | 'clipboard' | 'package' | 'coffee'
  | 'logout' | 'play' | 'clock' | 'target' | 'users' | 'layers' | 'flag'
  | 'award' | 'image' | 'video' | 'list' | 'key' | 'phone' | 'refresh'
  | 'calendar' | 'grid' | 'info' | 'arrowUp' | 'arrowDown' | 'copy' | 'backspace'
  | 'wrench' | 'palette' | 'inbox' | 'stamp' | 'medal' | 'message';

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20Z" />
      <path d="M9.5 21.5v-7h5v7" />
    </>
  ),
  box: (
    <>
      <path d="M20.5 7.5 12 3.2 3.5 7.5v9L12 20.8l8.5-4.3Z" />
      <path d="M3.5 7.5 12 11.8l8.5-4.3M12 11.8v9" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.2A2.2 2.2 0 0 1 6.2 17H20" />
      <path d="M6.2 2.5H20v19H6.2A2.2 2.2 0 0 1 4 19.3V4.7a2.2 2.2 0 0 1 2.2-2.2Z" />
    </>
  ),
  chart: (
    <>
      <path d="M6 20v-6M12 20V5M18 20v-9" />
    </>
  ),
  camera: (
    <>
      <path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3l1.6-2.6h6.8L17 7.5h3a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 2.5v19M4.2 7l15.6 10M19.8 7 4.2 17" />
      <path d="M12 6.2 9.6 4M12 6.2 14.4 4M12 17.8l-2.4 2.2M12 17.8l2.4 2.2" />
    </>
  ),
  cabinet: (
    <>
      <path d="M4 20.5h16M4.8 20.5v-6.2a7.2 7.2 0 0 1 14.4 0v6.2" />
      <path d="M12 7.1V4.4M9.5 11.5h5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.6a6 6 0 1 0-12 0c0 6-2.2 7.6-2.2 7.6h16.4S18 14.6 18 8.6Z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 2 18.3A2 2 0 0 0 3.7 21.3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4.2M12 17.4h.01" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7.2" />
      <path d="m20.5 20.5-4.3-4.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M3.5 6.5h17M8.5 6.5V4.8A1.3 1.3 0 0 1 9.8 3.5h4.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.3 6.5 7.2 20a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
    </>
  ),
  edit: (
    <>
      <path d="M12.5 4.5H5a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-7.5" />
      <path d="M18 2.6a2 2 0 0 1 2.9 2.8L12.4 14l-3.6.8.8-3.6Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6.5h10M18 6.5h2M4 17.5h2M10 17.5h10" />
      <circle cx="16" cy="6.5" r="2" />
      <circle cx="8" cy="17.5" r="2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 17.5v1.8a1.7 1.7 0 0 0 1.7 1.7h12.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7.5 8 12 3.5 16.5 8" />
      <path d="M4 17.5v1.8a1.7 1.7 0 0 0 1.7 1.7h12.6a1.7 1.7 0 0 0 1.7-1.7v-1.8" />
    </>
  ),
  send: (
    <>
      <path d="M21.5 2.5 10.8 13.2M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9Z" />
    </>
  ),
  cap: (
    <>
      <path d="M22 9.5 12 5 2 9.5l10 4.5Z" />
      <path d="M6 11.7v4.6c3 2.8 9 2.8 12 0v-4.6M22 9.5v5.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  store: (
    <>
      <path d="M4 10.5v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3 6.5h18l-1 4a3 3 0 0 1-5.7.6 3 3 0 0 1-5.6 0A3 3 0 0 1 4 10.5Z" />
      <path d="M3 6.5 4.5 3.5h15L21 6.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 4.6 3.1 8 7.5 9.4 4.4-1.4 7.5-4.8 7.5-9.4V6Z" />
    </>
  ),
  flash: <path d="M13 2.5 3.8 13.7h7L11 21.5l9.2-11.2h-7Z" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="1.8" />
      <path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H7A1.5 1.5 0 0 0 5.5 6v14A1.5 1.5 0 0 0 7 21.5h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1.2" />
    </>
  ),
  package: (
    <>
      <path d="M20.5 7.5 12 3.2 3.5 7.5v9L12 20.8l8.5-4.3Z" />
      <path d="m7.8 5.4 8.5 4.3v4M3.5 7.5 12 11.8l8.5-4.3" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8.5h13v6.2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M17 10h1.6a2.6 2.6 0 0 1 0 5.2H17" />
      <path d="M7.5 2.5v3M11 2.5v3" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5h4.5" />
      <path d="M16 16.5 20.5 12 16 7.5M20.5 12H9" />
    </>
  ),
  play: <path d="M7 4.5v15l12.5-7.5Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.6 3.6 0 0 1 0 6.8M18.5 14.2a6.5 6.5 0 0 1 3 5.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 4.8-9 4.8-9-4.8Z" />
      <path d="m3 12.2 9 4.8 9-4.8M3 16.4l9 4.8 9-4.8" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21.5v-18" />
      <path d="M5 4h11.5l-2 4 2 4H5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.6 14 7 21.5l5-2.8 5 2.8-1.6-7.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="m21 15.5-5-5L5 20" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5.5" width="14" height="13" rx="2" />
      <path d="m16.5 10 5-3v10l-5-3" />
    </>
  ),
  list: <path d="M9 6h11.5M9 12h11.5M9 18h11.5M4 6h.01M4 12h.01M4 18h.01" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="m10.4 12.6 9.6-9.6M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.2" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 0 1-15.2 5.2M3.5 12A8.5 8.5 0 0 1 18.7 6.8" />
      <path d="M19 2.5v4.6h-4.6M5 21.5v-4.6h4.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6h.01" />
    </>
  ),
  arrowUp: <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  arrowDown: <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="1.8" />
      <path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </>
  ),
  backspace: (
    <>
      <path d="M21 5H8.5L2.5 12l6 7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="m16.5 9.5-5 5M11.5 9.5l5 5" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a4 4 0 0 0 5 5L21 12.6a6 6 0 0 1-7.3 1.6l-6.9 6.9a2 2 0 0 1-2.9-2.9l6.9-6.9A6 6 0 0 1 12.4 4l1.3 1.3Z" />
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" />
      <path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13.5 5.5 5h13L21 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19Z" />
      <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
    </>
  ),
  stamp: (
    <>
      <path d="M9.5 3.5h5l-1 7h-3Z" />
      <path d="M4.5 14.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2.5h-15Z" />
      <path d="M5 20.5h14" />
    </>
  ),
  medal: (
    <>
      <path d="M8 2.5 10.5 9M16 2.5 13.5 9" />
      <circle cx="12" cy="15" r="5.5" />
      <path d="m12 12.3.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" />
    </>
  ),
  message: (
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h0A1.5 1.5 0 0 1 4 15.5Z" />
  ),
};

interface IconProps {
  name: IconName;
  /** Piksel cinsinden kenar uzunluğu. Varsayılan 20. */
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className = '', strokeWidth = 1.5 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    {PATHS[name]}
  </svg>
);
