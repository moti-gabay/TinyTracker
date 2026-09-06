/**
 * Inline SVG icon set.
 *
 * Emoji were the obvious shortcut here, but they render inconsistently across
 * Android OEM fonts (and not at all where the emoji font is absent), and they
 * cannot inherit the night palette. These do both.
 */
import type { ReactElement } from 'react'

export type IconName =
  | 'timer'
  | 'bottle'
  | 'pump'
  | 'diaper'
  | 'list'
  | 'sun'
  | 'moon'
  | 'gear'
  | 'drop'
  | 'poop'

const PATHS: Record<IconName, ReactElement> = {
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </>
  ),
  bottle: (
    <>
      <path d="M9 2h6M10 5h4M9.5 8h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
      <path d="M10 5V2.5M14 5V2.5M8 13h8" />
    </>
  ),
  pump: (
    <>
      <path d="M7 10h10v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4M7 15h10" />
    </>
  ),
  diaper: (
    <>
      <path d="M4 6h16v4a9 9 0 0 1-8 9 9 9 0 0 1-8-9V6Z" />
      <path d="M4 10h5M15 10h5" />
    </>
  ),
  list: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  drop: <path d="M12 3c3 4 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 3-6 6-10Z" />,
  poop: (
    <>
      <path d="M9 8a2.5 2.5 0 0 1 2.5-3.5c2 0 2.8 1.6 2.4 3.5" />
      <path d="M7.5 13a2.5 2.5 0 0 1 .3-5H15a2.5 2.5 0 0 1 1.5 5" />
      <path d="M6 18a2.5 2.5 0 0 1 1-5h10a2.5 2.5 0 0 1 1 5" />
      <path d="M5 18h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4Z" />
    </>
  ),
}

export function Icon({
  name,
  size = 24,
  className,
  filled = false,
}: {
  name: IconName
  size?: number
  className?: string
  filled?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
