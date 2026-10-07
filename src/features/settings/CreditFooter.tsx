import { useT } from '@/lib/i18n'

const BUSINESS_NAME = 'MG Software House'
const BUSINESS_URL = 'https://mg-software-house.vercel.app/'
const LOGO_SRC = '/logo-mark.webp'

/** Who built it. Text uses the theme tokens, so it reads the same at night. */
export function CreditFooter() {
  const t = useT()
  return (
    <footer className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-text-muted">
      <a
        href={BUSINESS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 active:opacity-70"
      >
        <img src={LOGO_SRC} alt="" className="h-6 w-auto" />
        <span>{t('credit.developedBy', { name: BUSINESS_NAME })}</span>
      </a>
      <p>{t('credit.copyright', { name: BUSINESS_NAME })}</p>
    </footer>
  )
}
