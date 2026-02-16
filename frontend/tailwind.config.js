/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  // Disable Tailwind's preflight to avoid conflicts with Ant Design
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1890ff',
          hover: '#40a9ff',
          active: '#096dd9',
        },
        success: '#52c41a',
        warning: '#faad14',
        error: '#ff4d4f',
        info: '#1890ff',
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
        'header': '56px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': '12px',
        'sm': '13px',
        'base': '14px',
        'lg': '16px',
        'xl': '18px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'md': '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
        'lg': '0 4px 16px 0 rgba(0, 0, 0, 0.12)',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'lg': '8px',
      },
    },
  },
  plugins: [],
};
