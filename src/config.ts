import type { ThemeConfig } from './types'

export const themeConfig: ThemeConfig = {
  // SITE INFO ///////////////////////////////////////////////////////////////////////////////////////////
  site: {
    website: 'https://www.way2.io', // Site domain
    title: 'Way2', // Site title
    author: 'Way2', // Author name
    description:
      'Lose Yourself, Not Your Friends. P2P mesh networking for crowded events - phones connect directly when cell networks fail.', // Site description
    language: 'en-US' // Default language
  },

  // GENERAL SETTINGS ////////////////////////////////////////////////////////////////////////////////////
  general: {
    contentWidth: '845px', // Content area width - wider for landing page
    centeredLayout: true, // Use centered layout (false for left-aligned)
    favicon: false, // Show favicon on index page
    themeToggle: false, // Show theme toggle button (uses system theme by default)
    footer: true, // Show footer
    fadeAnimation: true // Enable fade animations
  },

  // WAY2 SPECIFIC SETTINGS //////////////////////////////////////////////////////////////////////////////
  way2: {
    betaSignupEnabled: true, // Enable beta signup form
    videoDemo: true, // Show video demo section
    testimonials: true // Show testimonials section
  }
}
