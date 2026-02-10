// Site info configuration type
export interface SiteInfo {
  website: string
  title: string
  author: string
  description: string
  language: string
}

// General settings configuration type
export interface GeneralSettings {
  contentWidth: string
  centeredLayout: boolean
  favicon: boolean
  themeToggle: boolean
  footer: boolean
  fadeAnimation: boolean
}

// Way2 specific settings configuration type
export interface Way2Settings {
  betaSignupEnabled: boolean
  videoDemo: boolean
  testimonials: boolean
}

// Theme configuration type
export interface ThemeConfig {
  site: SiteInfo
  general: GeneralSettings
  way2: Way2Settings
}
