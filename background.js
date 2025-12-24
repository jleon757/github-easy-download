// Background service worker for GitHub Easy Download extension
// Handles API calls, caching, and communication with content scripts

// Cache configuration
const CACHE_KEY_PREFIX = 'cache_';
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_HEADERS = {
  'Accept': 'application/vnd.github.v3+json'
};

// Default settings
const DEFAULT_SETTINGS = {
  includePrereleases: false,
  showOldReleaseWarning: true,
  oldReleaseThresholdDays: 365,
  cacheTTLMinutes: 15
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('settings');
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

// Message handler for content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchRelease') {
    handleFetchRelease(request.owner, request.repo)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get('settings')
      .then(stored => sendResponse(stored.settings || DEFAULT_SETTINGS))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === 'clearCache') {
    clearCache(request.owner, request.repo)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Fetch release data with caching
async function handleFetchRelease(owner, repo) {
  const cacheKey = `${CACHE_KEY_PREFIX}${owner}/${repo}`;

  // Check cache first
  const cached = await getCachedData(cacheKey);
  if (cached && !isCacheStale(cached)) {
    return { data: cached.data, fromCache: true };
  }

  // Fetch fresh data from GitHub API
  try {
    const settings = await getSettings();
    const data = await fetchReleaseFromAPI(owner, repo, settings.includePrereleases);

    // Cache the successful response
    await setCachedData(cacheKey, data, settings.cacheTTLMinutes);

    return { data, fromCache: false };
  } catch (error) {
    // If API fails and we have stale cache, use it
    if (cached) {
      return { data: cached.data, fromCache: true, stale: true };
    }
    throw error;
  }
}

// Fetch release from GitHub API
async function fetchReleaseFromAPI(owner, repo, includePrereleases) {
  const endpoint = includePrereleases
    ? `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`
    : `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/latest`;

  const response = await fetch(endpoint, {
    headers: GITHUB_API_HEADERS
  });

  if (response.status === 404) {
    return null; // No releases or private repo
  }

  if (response.status === 403) {
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    if (rateLimitRemaining === '0') {
      throw new Error('RATE_LIMITED');
    }
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();

  // If fetching all releases, take the first one
  const release = includePrereleases && Array.isArray(data) ? data[0] : data;

  if (!release) {
    return null;
  }

  // Transform to our internal format
  return {
    tagName: release.tag_name,
    name: release.name,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    htmlUrl: release.html_url,
    assets: release.assets.map(asset => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size,
      contentType: asset.content_type,
      downloadCount: asset.download_count
    }))
  };
}

// Get cached data
async function getCachedData(key) {
  const stored = await chrome.storage.local.get(key);
  return stored[key];
}

// Set cached data with TTL
async function setCachedData(key, data, ttlMinutes) {
  const ttlMs = ttlMinutes * 60 * 1000;
  const cacheEntry = {
    data,
    timestamp: Date.now(),
    ttl: ttlMs
  };
  await chrome.storage.local.set({ [key]: cacheEntry });
}

// Check if cache is stale
function isCacheStale(cached) {
  const age = Date.now() - cached.timestamp;
  return age > cached.ttl;
}

// Clear cache for specific repo or all
async function clearCache(owner, repo) {
  if (owner && repo) {
    const key = `${CACHE_KEY_PREFIX}${owner}/${repo}`;
    await chrome.storage.local.remove(key);
  } else {
    // Clear all cache entries
    const stored = await chrome.storage.local.get();
    const cacheKeys = Object.keys(stored).filter(key => key.startsWith(CACHE_KEY_PREFIX));
    await chrome.storage.local.remove(cacheKeys);
  }
}

// Get current settings
async function getSettings() {
  const stored = await chrome.storage.sync.get('settings');
  return stored.settings || DEFAULT_SETTINGS;
}

// Export for module usage
export {
  handleFetchRelease,
  getSettings,
  clearCache
};