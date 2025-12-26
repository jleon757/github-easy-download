# GitHub Easy Download - Chrome Extension

A Chrome extension that adds a "Download" button to GitHub repository pages, automatically detecting your OS/architecture and matching the most appropriate release asset for one-click download.

## Features

- **Automatic OS Detection**: Detects Windows, macOS, or Linux automatically
- **Dual Button Placement**: Adds download buttons both in the header and sidebar for maximum visibility
- **Old Release Warning**: Shows a subtle warning for releases older than a year

## Screenshots
<img width="1400" height="560" alt="Image" src="https://github.com/user-attachments/assets/6916dc53-52f6-4be6-b6ca-6075b3e8882d" />

<img width="1280" height="800" alt="Image" src="https://github.com/user-attachments/assets/aedb5016-fd5e-40ae-b81e-1d5ef943cae1" />

<img width="1280" height="800" alt="Image" src="https://github.com/user-attachments/assets/e6901d2a-8e51-47d9-8802-e17a5b61a4af" />

## Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/github-easy-download.git
   cd github-easy-download
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

5. The extension is now installed and active!

## Usage

1. Navigate to any GitHub repository page (e.g., `github.com/owner/repo`)

2. Look for the blue "Download" button next to the green "Code" button

3. Click to download the best matching release for your system

4. If no perfect match is found, the button will show "View Releases" and take you to the releases page

## Configuration

Click the extension icon in Chrome's toolbar to access:

- **Current repository info** - Shows detected repo and latest release
- **System detection** - Displays your detected OS and architecture
- **Cache management** - Clear cached data for better performance

Access the options page through the popup or Chrome's extension settings to configure:

- **Include Pre-releases** - Whether to consider pre-release versions
- **Old Release Warning** - Show warning for releases older than specified days
- **Cache Duration** - How long to cache API responses (5-60 minutes)

## How It Works

### Asset Matching Algorithm

The extension uses a sophisticated scoring system to match release assets:

1. **File Extension Priority**:
   - Windows: `.exe` > `.msi` > `.zip`
   - macOS: `.dmg` > `.pkg` > `.zip`
   - Linux: `.AppImage` > `.deb` > `.rpm` > `.tar.gz`

2. **OS Keyword Matching**:
   - Looks for OS-specific keywords in filenames
   - Examples: "windows", "win64", "macos", "darwin", "linux"

3. **Architecture Detection**:
   - Matches architecture keywords: "x64", "arm64", "x86", etc.
   - Special handling for Apple Silicon Macs

4. **Penalty System**:
   - Penalizes files that explicitly target different OS/architecture
   - Avoids source archives and documentation files

### API Rate Limiting

- Uses GitHub's public API (60 requests/hour when unauthenticated)
- Implements intelligent caching to minimize API calls
- Shows cached data when rate limited

## Development

### Project Structure

```
github-easy-download/
├── manifest.json           # Extension manifest (Manifest V3)
├── background.js           # Service worker for API calls + caching
├── content.js              # DOM injection and UI logic
├── content.css             # Styles for injected buttons
├── popup/                  # Extension popup interface
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                # Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Key Technologies

- Chrome Extension Manifest V3
- Service Workers for background processing
- Content Scripts for DOM manipulation
- Chrome Storage API for settings and caching
- GitHub REST API v3

## Privacy

This extension:
- Does not collect any personal data
- Does not require GitHub authentication
- Only stores cache data and settings locally
- Makes requests only to GitHub's public API

## Known Limitations

- Limited to 60 API requests per hour (GitHub's rate limit for unauthenticated requests)
- May not perfectly detect Apple Silicon Macs in some browsers
- Requires manual installation (not on Chrome Web Store yet)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

If you encounter any issues or have suggestions:
- Open an issue on [GitHub](https://github.com/jleon757/github-easy-download/issues)
- Check existing issues for solutions

---

Made with care to simplify software downloads from GitHub
