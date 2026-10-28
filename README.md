# Welcome page — Desktop Sticky Notes

This folder is the website copy of the extension's Welcome page (`index.html` + `css`, `js`, `icons`, `images`).

## Publish on GitHub Pages
1. On github.com create a new **public** repository, for example `desktop-sticky-notes` (account `stickynotesdesktop`).
2. Upload the contents of this folder to the repository root (Add file → Upload files), including the empty `.nojekyll` file.
3. Settings → Pages → Build and deployment → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)` → Save.
4. In a minute the page is at `https://stickynotesdesktop.github.io/desktop-sticky-notes/`.

The extension already lets this address talk to it (`externally_connectable` in manifest.json: `https://stickynotesdesktop.github.io/*`).
To make the extension open this page after install instead of its own copy, put the address into `WELCOME_SITE_URL` in `extension/js/background.js`.
