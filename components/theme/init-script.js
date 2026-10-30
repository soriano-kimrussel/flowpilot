// Plain module (not 'use client') so the root layout can inline the script string.
export const THEME_STORAGE_KEY = 'flowpilot-theme';

/**
 * Runs inline in <head> before first paint so the saved theme applies without a flash.
 * Dark is the default; only an explicit "light" choice switches.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;
