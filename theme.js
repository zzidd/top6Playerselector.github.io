(function () {
  // Universal Dark Mode System
  function initDarkMode() {
    const savedTheme = localStorage.getItem('top6_theme') || 'light';
    const isDarkMode = savedTheme === 'dark';
    updateTheme(isDarkMode);
    return isDarkMode;
  }

  function updateTheme(isDarkMode) {
    const themeToggle = document.getElementById('theme-toggle');
    
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeToggle) {
        themeToggle.textContent = '☀️';
        themeToggle.setAttribute('aria-label', 'Toggle light mode');
      }
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeToggle) {
        themeToggle.textContent = '🌙';
        themeToggle.setAttribute('aria-label', 'Toggle dark mode');
      }
    }
    
    localStorage.setItem('top6_theme', isDarkMode ? 'dark' : 'light');
  }

  function toggleTheme() {
    const currentTheme = localStorage.getItem('top6_theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    updateTheme(newTheme === 'dark');
  }

  // Initialize dark mode as soon as possible
  let isDarkMode = initDarkMode();

  // Add event listener to theme toggle if it exists
  document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
      // Update button state in case it was added after initialization
      updateTheme(isDarkMode);
    }
  });

  // Also handle dynamic addition of theme toggle
  const observer = new MutationObserver(() => {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle && !themeToggle.hasAttribute('data-theme-listener')) {
      themeToggle.setAttribute('data-theme-listener', 'true');
      themeToggle.addEventListener('click', toggleTheme);
      updateTheme(isDarkMode);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Export functions for use in other scripts
  window.TOP6_THEME = {
    initDarkMode,
    updateTheme,
    toggleTheme,
    isDarkMode: () => localStorage.getItem('top6_theme') === 'dark'
  };
})();
