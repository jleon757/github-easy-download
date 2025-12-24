// Popup script for GitHub Easy Download extension

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Display current repository info
  displayRepoInfo(tab);

  // Display system info
  displaySystemInfo();

  // Set up event listeners
  setupEventListeners(tab);
});

// Display repository information
async function displayRepoInfo(tab) {
  const repoNameEl = document.getElementById('repo-name');
  const releaseInfoEl = document.getElementById('release-info');
  const releaseVersionEl = document.getElementById('release-version');

  if (!tab.url || !tab.url.includes('github.com')) {
    repoNameEl.textContent = 'Not on GitHub';
    return;
  }

  // Parse repository from URL
  const url = new URL(tab.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length < 2) {
    repoNameEl.textContent = 'Not on a repository page';
    return;
  }

  const owner = pathParts[0];
  const repo = pathParts[1];

  // Check if it's actually a repo page
  const excluded = ['settings', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'orgs', 'users'];
  if (excluded.includes(owner)) {
    repoNameEl.textContent = 'Not on a repository page';
    return;
  }

  repoNameEl.textContent = `${owner}/${repo}`;

  // Try to get cached release info
  const cacheKey = `cache_${owner}/${repo}`;
  const cached = await chrome.storage.local.get(cacheKey);

  if (cached[cacheKey] && cached[cacheKey].data) {
    releaseInfoEl.style.display = 'block';
    releaseVersionEl.textContent = cached[cacheKey].data.tagName || 'Unknown';

    // Show cache age
    const age = Date.now() - cached[cacheKey].timestamp;
    const ageMinutes = Math.floor(age / (1000 * 60));

    if (ageMinutes > 0) {
      const cacheStatus = document.getElementById('cache-status');
      cacheStatus.textContent = `Cached ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} ago`;
    }
  } else {
    // Try to fetch fresh data
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'fetchRelease',
          owner,
          repo
        }, resolve);
      });

      if (response && response.data && response.data.tagName) {
        releaseInfoEl.style.display = 'block';
        releaseVersionEl.textContent = response.data.tagName;
      }
    } catch (error) {
      console.error('Error fetching release:', error);
    }
  }
}

// Display system information
async function displaySystemInfo() {
  const osEl = document.getElementById('system-os');
  const archEl = document.getElementById('system-arch');

  // Detect system using same logic as content script
  const system = await detectUserSystem();

  osEl.textContent = formatOS(system.os);
  archEl.textContent = formatArch(system.arch);
}

// Detect user system (simplified version)
async function detectUserSystem() {
  const system = {
    os: 'unknown',
    arch: 'unknown'
  };

  // Try User-Agent Client Hints API
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const highEntropy = await navigator.userAgentData.getHighEntropyValues([
        'platform',
        'architecture',
        'bitness'
      ]);

      // Detect OS
      if (highEntropy.platform === 'Windows') {
        system.os = 'windows';
      } else if (highEntropy.platform === 'macOS') {
        system.os = 'macos';
      } else if (highEntropy.platform === 'Linux') {
        system.os = 'linux';
      }

      // Detect architecture
      if (highEntropy.architecture === 'arm') {
        system.arch = 'arm64';
      } else if (highEntropy.architecture === 'x86' && highEntropy.bitness === '64') {
        system.arch = 'x64';
      } else if (highEntropy.architecture === 'x86') {
        system.arch = 'x86';
      }
    } catch (e) {
      // Fallback to UA string
    }
  }

  // Fallback to User-Agent string
  if (system.os === 'unknown') {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (ua.includes('windows') || platform.includes('win')) {
      system.os = 'windows';
    } else if (ua.includes('mac') || platform.includes('mac')) {
      system.os = 'macos';
    } else if (ua.includes('linux') && !ua.includes('android')) {
      system.os = 'linux';
    }

    // Architecture from UA
    if (ua.includes('x86_64') || ua.includes('x64') || ua.includes('win64')) {
      system.arch = 'x64';
    } else if (ua.includes('aarch64') || ua.includes('arm64')) {
      system.arch = 'arm64';
    }
  }

  return system;
}

// Format OS name for display
function formatOS(os) {
  const names = {
    'windows': 'Windows',
    'macos': 'macOS',
    'linux': 'Linux',
    'unknown': 'Unknown'
  };
  return names[os] || 'Unknown';
}

// Format architecture for display
function formatArch(arch) {
  const names = {
    'x64': 'x64 (Intel/AMD)',
    'arm64': 'ARM64',
    'x86': 'x86 (32-bit)',
    'unknown': 'Unknown'
  };
  return names[arch] || 'Unknown';
}

// Set up event listeners
function setupEventListeners(tab) {
  // Clear cache button
  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    const btn = document.getElementById('clear-cache-btn');
    const originalText = btn.textContent;

    btn.textContent = 'Clearing...';
    btn.disabled = true;

    // Parse repo from current tab if on GitHub
    let owner = null;
    let repo = null;

    if (tab.url && tab.url.includes('github.com')) {
      const url = new URL(tab.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        owner = pathParts[0];
        repo = pathParts[1];
      }
    }

    // Clear cache
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'clearCache',
        owner,
        repo
      }, resolve);
    });

    // Update UI
    btn.textContent = 'Cleared!';
    document.getElementById('cache-status').textContent = 'Cache cleared successfully';

    // Reset after delay
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
      document.getElementById('cache-status').textContent = 'Cache stores release data for faster loading';
    }, 2000);

    // Reload the current tab if it's a GitHub repo page
    if (owner && repo) {
      chrome.tabs.reload(tab.id);
    }
  });

  // Options link
  document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}