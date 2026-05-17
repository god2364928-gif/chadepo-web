import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { translations, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../i18n/translations'

const STORAGE_KEY = 'chadepo_admin_lang'

const LanguageContext = createContext(null)

function readInitialLang() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved
  } catch {
    // ignore (private mode / storage disabled)
  }
  return DEFAULT_LANGUAGE
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const setLang = useCallback((next) => {
    if (SUPPORTED_LANGUAGES.includes(next)) setLangState(next)
  }, [])

  const t = useCallback(
    (key) => {
      const dict = translations[lang] ?? translations[DEFAULT_LANGUAGE]
      return dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key
    },
    [lang]
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
