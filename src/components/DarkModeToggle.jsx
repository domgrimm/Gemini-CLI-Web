import { memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';

function DarkModeToggle() {
  const { isDarkMode, toggleDarkMode } = useTheme();

  return (
    <button
      onClick={toggleDarkMode}
      className={`group relative inline-flex h-9 w-16 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gemini-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
        isDarkMode ? 'bg-zinc-700' : 'bg-zinc-200'
      }`}
      role="switch"
      aria-checked={isDarkMode}
      aria-label="Toggle dark mode"
    >
      <span className="sr-only">Toggle dark mode</span>
      <div
        className={`flex items-center justify-center h-7 w-7 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
          isDarkMode ? 'translate-x-8' : 'translate-x-1'
        }`}
      >
        {isDarkMode ? (
          <Moon className="w-4 h-4 text-zinc-800" />
        ) : (
          <Sun className="w-4 h-4 text-yellow-500" />
        )}
      </div>
    </button>
  );
}

export default memo(DarkModeToggle);