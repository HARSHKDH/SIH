import type { SVGProps } from 'react';

/**
 * Inline icon set.
 *
 * Hand-rolled rather than pulled from an icon package: this app needs well under two
 * dozen glyphs, a dependency would ship hundreds, and a consistent 20×20 grid with a
 * 1.6 stroke is what keeps the interface feeling like one piece of software.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.75" y="2.75" width="6" height="6" rx="1.2" />
      <rect x="11.25" y="2.75" width="6" height="6" rx="1.2" />
      <rect x="2.75" y="11.25" width="6" height="6" rx="1.2" />
      <rect x="11.25" y="11.25" width="6" height="6" rx="1.2" />
    </Icon>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 7V4.6a1.85 1.85 0 011.85-1.85H7" />
      <path d="M13 2.75h2.4a1.85 1.85 0 011.85 1.85V7" />
      <path d="M17.25 13v2.4a1.85 1.85 0 01-1.85 1.85H13" />
      <path d="M7 17.25H4.6a1.85 1.85 0 01-1.85-1.85V13" />
      <path d="M5.5 10h9" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6.2V10l2.8 1.7" />
    </Icon>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.6l5.75 2.2v4.3c0 3.4-2.3 6.5-5.75 8-3.45-1.5-5.75-4.6-5.75-8V4.8L10 2.6z" />
      <path d="M7.6 10.1l1.7 1.7 3.3-3.5" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 17.25H4.6a1.85 1.85 0 01-1.85-1.85V4.6A1.85 1.85 0 014.6 2.75H8" />
      <path d="M13 13.5l3.5-3.5L13 6.5" />
      <path d="M16.2 10H7.5" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3v9" />
      <path d="M6.5 8.8L10 12.3l3.5-3.5" />
      <path d="M3.5 14.5v1.2a1.6 1.6 0 001.6 1.6h9.8a1.6 1.6 0 001.6-1.6v-1.2" />
    </Icon>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.5 10a6.5 6.5 0 11-2.3-4.96" />
      <path d="M16.9 3.2v3.2h-3.2" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.9 7.4a1.6 1.6 0 011.6-1.6h1.3l1-1.7h6.4l1 1.7h1.3a1.6 1.6 0 011.6 1.6v7a1.6 1.6 0 01-1.6 1.6H4.5a1.6 1.6 0 01-1.6-1.6v-7z" />
      <circle cx="10" cy="10.8" r="2.7" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13.5V4.2" />
      <path d="M6.5 7.7L10 4.2l3.5 3.5" />
      <path d="M3.5 14.5v1.2a1.6 1.6 0 001.6 1.6h9.8a1.6 1.6 0 001.6-1.6v-1.2" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 4.5L13 10l-5.5 5.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4.2v11.6M4.2 10h11.6" />
    </Icon>
  );
}
export function PaperclipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.4 6.1l-5.6 5.6a1.7 1.7 0 002.4 2.4l5.3-5.3a3.4 3.4 0 00-4.8-4.8l-5.4 5.4a5 5 0 007.1 7.1l3.3-3.3" />
    </Icon>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.2 3.3h5.9L15 7.2v9.5H5.2V3.3z" />
      <path d="M10.9 3.5v3.8h3.9" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 6.4h11.2M8.2 6.4V4.6h3.6v1.8M6 6.4l.6 9.1h6.8l.6-9.1" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.4 11.6l3.2-3.2" />
      <path d="M7.4 6.6l1.2-1.2a2.9 2.9 0 014.1 4.1l-1.2 1.2" />
      <path d="M12.6 13.4l-1.2 1.2a2.9 2.9 0 01-4.1-4.1l1.2-1.2" />
    </Icon>
  );
}
