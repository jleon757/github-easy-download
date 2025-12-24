// Content script for GitHub Easy Download extension
// Handles DOM injection, UI updates, and user interactions

// State management
let currentRepo = null;
let releaseData = null;
let userSystem = null;
let matchResult = null;
let settings = null;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initialize, 500); // Small delay to ensure GitHub's JS has loaded
  });
} else {
  setTimeout(initialize, 500); // Small delay to ensure GitHub's JS has loaded
}

// Main initialization
async function initialize() {
  if (!isRepoHomepage()) {
    return;
  }

  // Extract repo info
  currentRepo = extractRepoInfo();
  if (!currentRepo) {
    return;
  }

  // Get settings
  settings = await getSettings();

  // Detect user system
  userSystem = await detectUserSystem();

  // Fetch release data
  await fetchAndInjectButtons();

  // Set up navigation observers for GitHub's SPA
  setupNavigationObservers();
}

// Check if current page is a repository homepage
function isRepoHomepage() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);

  // Must be exactly /owner/repo (2 parts)
  if (parts.length !== 2) return false;

  // Exclude special GitHub pages
  const excluded = ['settings', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'orgs', 'users'];
  if (excluded.includes(parts[0])) return false;

  return true;
}

// Extract repository owner and name from URL
function extractRepoInfo() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);

  if (parts.length !== 2) return null;

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

// Get settings from background
async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      resolve(response || {});
    });
  });
}

// Detect user's operating system and architecture
async function detectUserSystem() {
  const system = {
    os: 'unknown',
    arch: 'unknown',
    raw: {
      platform: navigator.platform,
      userAgent: navigator.userAgent
    }
  };

  // Try modern User-Agent Client Hints API first
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

      system.raw.architecture = highEntropy.architecture;
      system.raw.bitness = highEntropy.bitness;
    } catch (e) {
      console.warn('Failed to get high entropy values:', e);
    }
  }

  // Fallback to User-Agent string parsing
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
    if (ua.includes('x86_64') || ua.includes('x64') || ua.includes('win64') || ua.includes('wow64')) {
      system.arch = 'x64';
    } else if (ua.includes('aarch64') || ua.includes('arm64')) {
      system.arch = 'arm64';
    } else if (ua.includes('i386') || ua.includes('i686')) {
      system.arch = 'x86';
    } else if (system.os === 'macos') {
      // Default to x64 for macOS if unclear (Rosetta compatibility)
      system.arch = 'x64';
    }
  }

  return system;
}

// Fetch release data and inject buttons
async function fetchAndInjectButtons() {
  // Remove existing buttons first
  removeInjectedButtons();

  // Show loading state
  injectLoadingButtons();

  try {
    // Fetch release data from background
    console.log('GitHub Easy Download: Fetching release for', currentRepo);
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'fetchRelease',
        owner: currentRepo.owner,
        repo: currentRepo.repo
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('GitHub Easy Download: Chrome runtime error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    console.log('GitHub Easy Download: Response from background:', response);

    if (!response) {
      console.error('GitHub Easy Download: No response from background script');
      removeInjectedButtons();
      return;
    }

    if (response.error) {
      if (response.error === 'RATE_LIMITED') {
        injectFallbackButtons('Rate limited - View Releases');
      } else {
        console.error('Error fetching release:', response.error);
        removeInjectedButtons();
      }
      return;
    }

    releaseData = response.data;
    console.log('GitHub Easy Download: Received release data:', releaseData);

    if (!releaseData) {
      console.log('GitHub Easy Download: No release data available');
      injectFallbackButtons('View Releases');
      return;
    }

    if (!releaseData.assets || releaseData.assets.length === 0) {
      console.log('GitHub Easy Download: Release has no assets');
      injectFallbackButtons('View Releases');
      return;
    }

    console.log(`GitHub Easy Download: Found ${releaseData.assets.length} assets`);

    // Find best matching asset
    matchResult = findBestAsset(releaseData.assets, userSystem);
    console.log('GitHub Easy Download: Match result:', matchResult);

    // Inject download buttons
    injectDownloadButtons();

  } catch (error) {
    console.error('Error in fetchAndInjectButtons:', error);
    removeInjectedButtons();
  }
}

// Find best matching asset for user's system
function findBestAsset(assets, userSystem) {
  const scores = assets.map(asset => ({
    asset,
    score: scoreAsset(asset, userSystem)
  }));

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Get top match and alternatives
  const topMatch = scores[0];
  const alternatives = scores.slice(1, 5).filter(s => s.score > 0);

  // Check if release is old
  const publishedDate = new Date(releaseData.publishedAt);
  const ageMs = Date.now() - publishedDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const isOldRelease = ageDays > (settings?.oldReleaseThresholdDays || 365);

  // Format age text
  let releaseAgeText = '';
  if (ageDays < 30) {
    releaseAgeText = `${ageDays} days ago`;
  } else if (ageDays < 365) {
    const months = Math.floor(ageDays / 30);
    releaseAgeText = `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(ageDays / 365);
    releaseAgeText = `${years} year${years > 1 ? 's' : ''} ago`;
  }

  return {
    matched: topMatch && topMatch.score > 20,
    asset: topMatch?.asset || null,
    score: topMatch?.score || 0,
    alternatives: alternatives.map(a => a.asset),
    isOldRelease,
    releaseAgeText,
    ageDays
  };
}

// Score an asset for the user's system
function scoreAsset(asset, userSystem) {
  let score = 0;
  const name = asset.name.toLowerCase();

  // Extension scoring (highest weight)
  score += getExtensionScore(name, userSystem.os);

  // OS keyword matching
  score += getOSKeywordScore(name, userSystem.os);

  // Architecture matching
  score += getArchScore(name, userSystem.arch);

  // Architecture mismatch penalty
  score += getArchMismatchPenalty(name, userSystem.arch);

  // OS mismatch penalty
  score += getOSMismatchPenalty(name, userSystem.os);

  return score;
}

// Score based on file extension
function getExtensionScore(filename, os) {
  if (os === 'windows') {
    if (filename.endsWith('.exe')) return 100;
    if (filename.endsWith('.msi')) return 90;
    if (filename.endsWith('.zip') && (filename.includes('win') || filename.includes('windows'))) return 70;
  } else if (os === 'macos') {
    if (filename.endsWith('.dmg')) return 100;
    if (filename.endsWith('.pkg')) return 90;
    if (filename.endsWith('.zip') && (filename.includes('mac') || filename.includes('darwin') || filename.includes('osx'))) return 70;
  } else if (os === 'linux') {
    if (filename.endsWith('.appimage')) return 100;
    if (filename.endsWith('.deb')) return 90;
    if (filename.endsWith('.rpm')) return 85;
    if ((filename.endsWith('.tar.gz') || filename.endsWith('.tar.xz')) && filename.includes('linux')) return 70;
  }
  return 0;
}

// Score based on OS keywords
function getOSKeywordScore(filename, os) {
  if (os === 'windows') {
    if (filename.includes('win64') || filename.includes('windows')) return 50;
    if (filename.includes('win')) return 40;
  } else if (os === 'macos') {
    if (filename.includes('macos') || filename.includes('darwin')) return 50;
    if (filename.includes('mac') || filename.includes('osx')) return 40;
  } else if (os === 'linux') {
    if (filename.includes('linux')) return 50;
    if (filename.includes('ubuntu') || filename.includes('debian')) return 30;
  }
  return 0;
}

// Score based on architecture
function getArchScore(filename, arch) {
  if (arch === 'x64') {
    if (filename.includes('x64') || filename.includes('x86_64') || filename.includes('amd64')) return 30;
    if (filename.includes('64bit') || filename.includes('64-bit')) return 20;
  } else if (arch === 'arm64') {
    if (filename.includes('arm64') || filename.includes('aarch64')) return 30;
    if (filename.includes('apple-silicon') || filename.includes('universal')) return 30;
    if (filename.includes('arm')) return 20;
  } else if (arch === 'x86') {
    if (filename.includes('x86') || filename.includes('i386') || filename.includes('i686')) return 30;
    if (filename.includes('32bit') || filename.includes('32-bit')) return 20;
  }
  return 0;
}

// Penalty for architecture mismatch
function getArchMismatchPenalty(filename, arch) {
  if (arch === 'x64') {
    if (filename.includes('arm64') || filename.includes('aarch64')) return -30;
    if (filename.includes('i386') || filename.includes('i686') || filename.includes('32bit')) return -20;
  } else if (arch === 'arm64') {
    if (filename.includes('x64') || filename.includes('x86_64') || filename.includes('amd64')) return -20;
    if (filename.includes('i386') || filename.includes('i686')) return -30;
  }
  return 0;
}

// Penalty for OS mismatch
function getOSMismatchPenalty(filename, os) {
  if (os === 'windows') {
    if (filename.includes('mac') || filename.includes('darwin') || filename.includes('linux')) return -50;
  } else if (os === 'macos') {
    if (filename.includes('win') || filename.includes('windows') || filename.includes('linux')) return -50;
  } else if (os === 'linux') {
    if (filename.includes('win') || filename.includes('windows') || filename.includes('mac') || filename.includes('darwin')) return -50;
  }
  return 0;
}

// Inject loading buttons
function injectLoadingButtons() {
  // Header button
  const headerButton = createButton('header', 'Loading...', true);
  injectHeaderButton(headerButton);

  // Sidebar button
  const sidebarButton = createButton('sidebar', 'Loading...', true);
  injectSidebarButton(sidebarButton);
}

// Inject download buttons
function injectDownloadButtons() {
  console.log('GitHub Easy Download: Injecting download buttons...');

  // Remove ALL existing buttons and containers first
  removeInjectedButtons();

  const buttonText = matchResult.matched
    ? `Download ${releaseData.tagName}`
    : 'View Releases';

  // Header button
  const headerButton = createButton('header', buttonText, false);
  if (matchResult.matched) {
    headerButton.addEventListener('click', handleDownloadClick);
  } else {
    headerButton.addEventListener('click', handleViewReleasesClick);
  }
  injectHeaderButton(headerButton);

  // Sidebar button with OS info
  const sidebarText = matchResult.matched
    ? `Download for ${getOSDisplayName(userSystem.os)}`
    : 'View All Releases';
  const sidebarButton = createButton('sidebar', sidebarText, false);
  if (matchResult.matched) {
    sidebarButton.addEventListener('click', handleDownloadClick);
  } else {
    sidebarButton.addEventListener('click', handleViewReleasesClick);
  }
  injectSidebarButton(sidebarButton);

  // Add old release warning if applicable
  if (matchResult.isOldRelease && settings?.showOldReleaseWarning) {
    addOldReleaseWarning(headerButton, sidebarButton);
  }
}

// Inject fallback buttons
function injectFallbackButtons(text) {
  // Remove any existing buttons (including loading buttons) first
  removeInjectedButtons();

  // Header button
  const headerButton = createButton('header', text, false);
  headerButton.addEventListener('click', handleViewReleasesClick);
  injectHeaderButton(headerButton);

  // Sidebar button
  const sidebarButton = createButton('sidebar', text, false);
  sidebarButton.addEventListener('click', handleViewReleasesClick);
  injectSidebarButton(sidebarButton);
}

// Create a button element
function createButton(type, text, loading) {
  const button = document.createElement('button');
  button.className = `gh-easy-download-btn gh-easy-download-btn-${type}`;
  button.setAttribute('data-gh-easy-download', 'true');

  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  }

  // Add download icon
  const icon = document.createElement('span');
  icon.className = 'gh-easy-download-icon';
  icon.innerHTML = loading ? '⏳' : '⬇';
  button.appendChild(icon);

  // Add text
  const textSpan = document.createElement('span');
  textSpan.className = 'gh-easy-download-text';

  // For header button, use shorter text if version is long
  if (type === 'header') {
    if (text.length > 18) {
      // Shorten "Download v1.2.3-beta.456" to "Download"
      if (text.startsWith('Download ')) {
        textSpan.textContent = 'Download';
        button.setAttribute('title', text); // Full text in tooltip
      } else if (text === 'View Releases') {
        textSpan.textContent = 'Releases';
        button.setAttribute('title', 'View all releases');
      } else {
        textSpan.textContent = text;
      }
    } else {
      textSpan.textContent = text;
    }
  } else {
    textSpan.textContent = text;
  }

  button.appendChild(textSpan);

  return button;
}

// Inject header button (next to Code button)
function injectHeaderButton(button) {
  // Find the Code button using multiple possible selectors
  let codeButton = document.querySelector('[data-testid="code-button"]');

  if (!codeButton) {
    // Try alternative selector for Code button
    codeButton = document.querySelector('#code-tab');
  }

  if (!codeButton) {
    // Try finding by aria-label
    codeButton = document.querySelector('button[aria-label*="Code"]');
  }

  if (!codeButton) {
    // Look for the green "Code" button specifically
    const buttons = Array.from(document.querySelectorAll('button'));
    codeButton = buttons.find(btn => {
      const text = btn.textContent.trim();
      const hasCodeText = text === 'Code' || text.startsWith('Code');
      const isGreen = btn.classList.toString().includes('btn-primary') ||
                      btn.classList.toString().includes('green') ||
                      window.getComputedStyle(btn).backgroundColor.includes('40, 167, 69');
      return hasCodeText && (isGreen || btn.classList.toString().includes('btn'));
    });
  }

  if (!codeButton) {
    // Last resort: find any element with "Code" that looks like a button
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.textContent.trim() === 'Code' &&
          (el.tagName === 'BUTTON' || el.tagName === 'A' || el.role === 'button')) {
        codeButton = el;
        break;
      }
    }
  }

  if (codeButton) {
    console.log('GitHub Easy Download: Found Code button', codeButton);

    // Strategy 1: Try to find the file navigation bar directly
    let fileNav = document.querySelector('.file-navigation');
    if (!fileNav) {
      // Look for common parent containers
      fileNav = document.querySelector('[class*="Box-header"]');
    }
    if (!fileNav) {
      // Look for the repository content area
      fileNav = document.querySelector('.repository-content');
    }

    let targetContainer = null;

    if (fileNav) {
      // Find the Code button within the file nav and use its parent
      const codeWithinNav = fileNav.contains(codeButton) ? codeButton : fileNav.querySelector('button');
      if (codeWithinNav) {
        targetContainer = codeWithinNav.parentElement;
      }
    }

    if (!targetContainer) {
      // Fallback: Find the Code button's container by going up the DOM
      let container = codeButton.parentElement;
      let depth = 0;

      while (container && depth < 5) {
        // Check if this container has other buttons (likely the button group)
        const buttons = container.querySelectorAll('button, a[role="button"]');
        if (buttons.length > 0) {
          targetContainer = container;
          break;
        }
        container = container.parentElement;
        depth++;
      }
    }

    if (targetContainer) {
      // Check if we have enough space in the container
      const containerRect = targetContainer.getBoundingClientRect();
      const codeButtonRect = codeButton.getBoundingClientRect();

      console.log('GitHub Easy Download: Container width:', containerRect.width);
      console.log('GitHub Easy Download: Code button position:', codeButtonRect.right);
      console.log('GitHub Easy Download: Container right:', containerRect.right);

      // Create a wrapper div for better positioning control
      const wrapper = document.createElement('div');
      wrapper.className = 'gh-easy-download-wrapper';

      // Check if button would wrap to second line
      const estimatedButtonWidth = 150; // Approximate width of our button
      const availableSpace = containerRect.right - codeButtonRect.right;

      console.log('GitHub Easy Download: Available space:', availableSpace);
      console.log('GitHub Easy Download: Estimated button width:', estimatedButtonWidth);
      console.log('GitHub Easy Download: Will create new row?', availableSpace < estimatedButtonWidth + 20);

      // Always create new row for better visibility and consistent positioning
      const forceNewRow = true;

      if (forceNewRow || availableSpace < estimatedButtonWidth + 20) {
        console.log('GitHub Easy Download: Creating centered button on new row');

        // Not enough space, create a new row with centered button
        wrapper.classList.add('new-row');

        // Create a container div that spans the full width
        const fullWidthContainer = document.createElement('div');
        fullWidthContainer.className = 'gh-easy-download-full-width';
        fullWidthContainer.style.width = '100%';
        fullWidthContainer.style.display = 'flex';
        fullWidthContainer.style.justifyContent = 'center';
        fullWidthContainer.style.alignItems = 'center';
        fullWidthContainer.style.marginTop = '12px';
        fullWidthContainer.style.marginBottom = '16px';
        fullWidthContainer.style.minHeight = '50px';


        console.log('GitHub Easy Download: Creating full-width container');

        // Find the main pjax container
        const pjaxContainer = document.querySelector('#repo-content-pjax-container') ||
                             document.querySelector('.repository-content');

        if (pjaxContainer) {
          console.log('GitHub Easy Download: Found pjax container');

          // Get all direct children
          const children = Array.from(pjaxContainer.children);
          console.log(`GitHub Easy Download: Container has ${children.length} children`);

          // Find the index of the navigation container (usually first)
          let navIndex = -1;
          for (let i = 0; i < children.length; i++) {
            if (children[i].querySelector('.file-navigation') ||
                children[i].querySelector('[class*="Box-header"]') ||
                children[i].querySelector('#code-tab')) {
              navIndex = i;
              console.log(`GitHub Easy Download: Found nav at index ${i}`);
              break;
            }
          }

          // Insert right after the navigation (before file list)
          if (navIndex !== -1 && navIndex < children.length - 1) {
            console.log('GitHub Easy Download: Inserting after nav at index', navIndex + 1);
            pjaxContainer.insertBefore(fullWidthContainer, children[navIndex + 1]);
          } else {
            console.log('GitHub Easy Download: Inserting at beginning of container');
            // Insert at the beginning if we can't find the nav
            pjaxContainer.insertBefore(fullWidthContainer, pjaxContainer.firstChild);
          }
        } else {
          // Method 2: Find the file list and insert before it
          console.log('GitHub Easy Download: Nav not found, looking for file list');

          const fileList = document.querySelector('[aria-labelledby="files"]') ||
                          document.querySelector('[role="grid"]') ||
                          document.querySelector('.js-navigation-container') ||
                          document.querySelector('.react-directory-listing') ||
                          document.querySelector('[class*="Tree"]');

          if (fileList) {
            const fileListBox = fileList.closest('[class*="Box"]') || fileList.parentElement;
            console.log('GitHub Easy Download: Inserting before file list');
            if (fileListBox && fileListBox.parentElement) {
              fileListBox.parentElement.insertBefore(fullWidthContainer, fileListBox);
            }
          } else {
            // Fallback: Find the container and insert at a reasonable position
            console.log('GitHub Easy Download: Using fallback insertion');
            const container = document.querySelector('#repo-content-pjax-container') ||
                            document.querySelector('.repository-content');
            if (container) {
              // Find the first Box element that's not the nav bar
              const boxes = container.querySelectorAll('[class*="Box"]');
              let inserted = false;
              for (const box of boxes) {
                if (!box.querySelector('.file-navigation') && !box.querySelector('#code-tab')) {
                  container.insertBefore(fullWidthContainer, box);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) {
                container.appendChild(fullWidthContainer);
              }
            }
          }
        }

        // Log the container's actual width
        setTimeout(() => {
          const rect = fullWidthContainer.getBoundingClientRect();
          console.log('GitHub Easy Download: Container width:', rect.width);
          console.log('GitHub Easy Download: Container position:', rect.left, 'to', rect.right);
          console.log('GitHub Easy Download: Parent element:', fullWidthContainer.parentElement);
        }, 100);

        fullWidthContainer.appendChild(wrapper);

        // Restore full text when centered (we have space)
        const textSpan = button.querySelector('.gh-easy-download-text');
        const fullText = button.getAttribute('title');
        if (textSpan && fullText) {
          textSpan.textContent = fullText;
          button.removeAttribute('title'); // Don't need tooltip when showing full text
        }
      } else {
        // Enough space, insert inline
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'middle';
        wrapper.style.marginLeft = '8px';

        if (codeButton.nextSibling) {
          codeButton.parentElement.insertBefore(wrapper, codeButton.nextSibling);
        } else {
          targetContainer.appendChild(wrapper);
        }
      }

      wrapper.appendChild(button);
      console.log('GitHub Easy Download: Header button injected');
    } else {
      console.log('GitHub Easy Download: Could not find container for header button');
    }
  } else {
    console.log('GitHub Easy Download: Could not find Code button');
  }
}

// Inject sidebar button
function injectSidebarButton(button) {
  // Find the Releases section in sidebar - try multiple selectors
  let releasesSection = null;
  let injectionPoint = null;

  console.log('GitHub Easy Download: Looking for sidebar releases section...');

  // Strategy 1: Find the releases heading in the sidebar
  const sidebarHeadings = document.querySelectorAll('[class*="BorderGrid"] h2, [class*="BorderGrid"] h3, .Layout-sidebar h2, .Layout-sidebar h3');
  for (const heading of sidebarHeadings) {
    if (heading.textContent.trim().includes('Release')) {
      console.log('GitHub Easy Download: Found releases heading in sidebar');
      releasesSection = heading.closest('[class*="BorderGrid-cell"]') || heading.parentElement;

      // Look for the link that says "+ X releases"
      const releasesLink = releasesSection?.querySelector('a[href*="/releases"]');
      if (releasesLink) {
        injectionPoint = releasesLink.parentElement;
      } else {
        injectionPoint = releasesSection;
      }
      break;
    }
  }

  // Strategy 2: Find by the specific release version link
  if (!releasesSection) {
    const releaseLinks = document.querySelectorAll('a[href*="/releases/tag/"]');
    for (const link of releaseLinks) {
      // Check if it's in the sidebar (right side of page)
      const rect = link.getBoundingClientRect();
      if (rect.left > window.innerWidth * 0.6) {
        console.log('GitHub Easy Download: Found release tag link in sidebar');
        const cell = link.closest('[class*="BorderGrid-cell"]');
        if (cell) {
          releasesSection = cell;
          injectionPoint = link.parentElement;
          break;
        }
      }
    }
  }

  // Strategy 3: Find the "About" section in sidebar
  if (!releasesSection) {
    const aboutHeading = Array.from(document.querySelectorAll('.Layout-sidebar h2, [class*="BorderGrid"] h2'))
      .find(h => h.textContent.trim() === 'About');

    if (aboutHeading) {
      const aboutSection = aboutHeading.closest('[class*="BorderGrid-cell"]') || aboutHeading.parentElement;
      const releaseInfo = aboutSection?.querySelector('a[href*="/releases"]');

      if (releaseInfo) {
        console.log('GitHub Easy Download: Found releases in About section');
        releasesSection = aboutSection;
        injectionPoint = releaseInfo.parentElement;
      }
    }
  }

  // Strategy 4: Find sidebar and look for any releases link
  if (!releasesSection) {
    const sidebar = document.querySelector('.Layout-sidebar') ||
                   document.querySelector('[class*="BorderGrid-row"]');

    if (sidebar) {
      const releaseLink = sidebar.querySelector('a[href*="/releases"]:not([href*="/releases/new"])');
      if (releaseLink) {
        console.log('GitHub Easy Download: Found releases link in sidebar layout');
        const cell = releaseLink.closest('[class*="BorderGrid-cell"]') || releaseLink.closest('div');
        if (cell) {
          releasesSection = cell;
          injectionPoint = releaseLink.parentElement;
        }
      }
    }
  }

  if (injectionPoint) {
    const container = document.createElement('div');
    container.className = 'gh-easy-download-sidebar-container';
    container.appendChild(button);
    container.style.marginTop = '8px';

    // Insert after the release info but within the same section
    if (injectionPoint.nextSibling) {
      injectionPoint.parentElement.insertBefore(container, injectionPoint.nextSibling);
    } else {
      injectionPoint.appendChild(container);
    }

    console.log('GitHub Easy Download: Sidebar button injected successfully');
  } else if (releasesSection) {
    // Fallback: append to the releases section
    const container = document.createElement('div');
    container.className = 'gh-easy-download-sidebar-container';
    container.appendChild(button);
    container.style.marginTop = '8px';
    releasesSection.appendChild(container);
    console.log('GitHub Easy Download: Sidebar button injected to releases section');
  } else {
    console.log('GitHub Easy Download: Could not find releases section for sidebar button');
  }
}

// Add old release warning
function addOldReleaseWarning(headerButton, sidebarButton) {
  const warningText = `Last updated ${matchResult.releaseAgeText}`;

  [headerButton, sidebarButton].forEach(button => {
    button.classList.add('old-release');
    button.setAttribute('title', warningText);

    // Add warning icon
    const warningIcon = document.createElement('span');
    warningIcon.className = 'gh-easy-download-warning';
    warningIcon.innerHTML = '⚠️';
    warningIcon.setAttribute('title', warningText);
    button.appendChild(warningIcon);
  });
}

// Handle download button click
function handleDownloadClick(event) {
  event.preventDefault();
  if (matchResult.matched && matchResult.asset) {
    // Initiate download
    window.location.href = matchResult.asset.downloadUrl;
  }
}

// Handle view releases click
function handleViewReleasesClick(event) {
  event.preventDefault();
  const releasesUrl = releaseData?.htmlUrl || `https://github.com/${currentRepo.owner}/${currentRepo.repo}/releases`;
  window.open(releasesUrl, '_blank');
}

// Get display name for OS
function getOSDisplayName(os) {
  const names = {
    'windows': 'Windows',
    'macos': 'macOS',
    'linux': 'Linux'
  };
  return names[os] || 'Your System';
}

// Remove all injected buttons
function removeInjectedButtons() {
  document.querySelectorAll('[data-gh-easy-download="true"]').forEach(el => {
    el.remove();
  });
  document.querySelectorAll('.gh-easy-download-sidebar-container').forEach(el => {
    el.remove();
  });
  document.querySelectorAll('.gh-easy-download-wrapper').forEach(el => {
    el.remove();
  });
  document.querySelectorAll('.gh-easy-download-full-width').forEach(el => {
    el.remove();
  });
}

// Set up navigation observers for GitHub's SPA
function setupNavigationObservers() {
  // Listen for GitHub's Turbo navigation events
  document.addEventListener('turbo:render', handleNavigation);
  document.addEventListener('turbo:before-render', handleNavigation);

  // Fallback: observe URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handleNavigation();
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// Handle navigation changes
function handleNavigation() {
  console.log('GitHub Easy Download: Navigation detected');
  // Delay to let page render
  setTimeout(() => {
    if (isRepoHomepage()) {
      const newRepo = extractRepoInfo();
      console.log('GitHub Easy Download: Navigation to repo:', newRepo);
      if (!currentRepo || currentRepo.owner !== newRepo.owner || currentRepo.repo !== newRepo.repo) {
        currentRepo = newRepo;
        initialize();
      }
    } else {
      console.log('GitHub Easy Download: Navigation to non-repo page');
      removeInjectedButtons();
      currentRepo = null;
    }
  }, 1000); // Increased delay for better reliability
}