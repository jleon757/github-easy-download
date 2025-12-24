// Options page script for GitHub Easy Download extension

// Default settings
const DEFAULT_SETTINGS = {
  includePrereleases: false,
  showOldReleaseWarning: true,
  oldReleaseThresholdDays: 365,
  cacheTTLMinutes: 15
};

// Load settings when page loads
document.addEventListener('DOMContentLoaded', loadSettings);

// Set up event listeners
document.getElementById('saveOptions').addEventListener('click', saveSettings);
document.getElementById('restoreDefaults').addEventListener('click', restoreDefaults);
document.getElementById('clearAllCache').addEventListener('click', clearAllCache);

// Auto-save when checkbox values change
document.querySelectorAll('.option-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    saveSettings(true); // Silent save
  });
});

// Validate number inputs
document.getElementById('oldReleaseThresholdDays').addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  if (value < 30) e.target.value = 30;
  if (value > 1095) e.target.value = 1095;
});

document.getElementById('cacheTTLMinutes').addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  if (value < 5) e.target.value = 5;
  if (value > 60) e.target.value = 60;
});

// Load settings from storage
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get('settings');
    const settings = stored.settings || DEFAULT_SETTINGS;

    // Set form values
    document.getElementById('includePrereleases').checked = settings.includePrereleases;
    document.getElementById('showOldReleaseWarning').checked = settings.showOldReleaseWarning;
    document.getElementById('oldReleaseThresholdDays').value = settings.oldReleaseThresholdDays;
    document.getElementById('cacheTTLMinutes').value = settings.cacheTTLMinutes;

    // Enable/disable old release threshold based on warning checkbox
    updateOldReleaseThresholdState();
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save settings to storage
async function saveSettings(silent = false) {
  try {
    const settings = {
      includePrereleases: document.getElementById('includePrereleases').checked,
      showOldReleaseWarning: document.getElementById('showOldReleaseWarning').checked,
      oldReleaseThresholdDays: parseInt(document.getElementById('oldReleaseThresholdDays').value),
      cacheTTLMinutes: parseInt(document.getElementById('cacheTTLMinutes').value)
    };

    // Validate values
    if (isNaN(settings.oldReleaseThresholdDays) || settings.oldReleaseThresholdDays < 30) {
      settings.oldReleaseThresholdDays = 365;
    }
    if (isNaN(settings.cacheTTLMinutes) || settings.cacheTTLMinutes < 5) {
      settings.cacheTTLMinutes = 15;
    }

    await chrome.storage.sync.set({ settings });

    if (!silent) {
      showStatus('Settings saved successfully', 'success');
    }

    // Update threshold field state
    updateOldReleaseThresholdState();
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', 'error');
  }
}

// Restore default settings
async function restoreDefaults() {
  try {
    // Set form values to defaults
    document.getElementById('includePrereleases').checked = DEFAULT_SETTINGS.includePrereleases;
    document.getElementById('showOldReleaseWarning').checked = DEFAULT_SETTINGS.showOldReleaseWarning;
    document.getElementById('oldReleaseThresholdDays').value = DEFAULT_SETTINGS.oldReleaseThresholdDays;
    document.getElementById('cacheTTLMinutes').value = DEFAULT_SETTINGS.cacheTTLMinutes;

    // Save defaults
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });

    showStatus('Settings restored to defaults', 'success');
    updateOldReleaseThresholdState();
  } catch (error) {
    console.error('Error restoring defaults:', error);
    showStatus('Error restoring defaults', 'error');
  }
}

// Clear all cache
async function clearAllCache() {
  const button = document.getElementById('clearAllCache');
  const originalText = button.textContent;

  try {
    button.textContent = 'Clearing...';
    button.disabled = true;

    // Send message to background script to clear cache
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'clearCache' }, (response) => {
        if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });

    button.textContent = 'Cleared!';
    showStatus('Cache cleared successfully', 'success');

    // Reset button after delay
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Error clearing cache:', error);
    button.textContent = originalText;
    button.disabled = false;
    showStatus('Error clearing cache', 'error');
  }
}

// Update old release threshold field state
function updateOldReleaseThresholdState() {
  const warningCheckbox = document.getElementById('showOldReleaseWarning');
  const thresholdInput = document.getElementById('oldReleaseThresholdDays');

  if (warningCheckbox.checked) {
    thresholdInput.disabled = false;
    thresholdInput.parentElement.classList.remove('disabled');
  } else {
    thresholdInput.disabled = true;
    thresholdInput.parentElement.classList.add('disabled');
  }
}

// Listen for changes to the warning checkbox
document.getElementById('showOldReleaseWarning').addEventListener('change', updateOldReleaseThresholdState);

// Show status message
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('save-status');

  statusEl.textContent = message;
  statusEl.className = `save-status ${type}`;
  statusEl.style.display = 'block';

  // Hide after 3 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// Prevent form submission
document.querySelector('.options-container').addEventListener('submit', (e) => {
  e.preventDefault();
});