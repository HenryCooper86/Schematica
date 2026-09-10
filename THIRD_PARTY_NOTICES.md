# Third-party notices

Schematica is served as static files without a build step. Local PDF and DOCX
extraction uses the bundled browser libraries below, loaded only when needed.
No parser library or document is fetched from a runtime CDN or remote service.
The repository also includes icon artwork.

## PDF.js 6.3.289

Official `pdfjs-dist` 6.3.289 npm distribution, Mozilla contributors, Apache-2.0.
Bundled in `vendor/pdfjs/`: main and worker modules, character maps and standard
font data needed for text extraction (including CJK). Rendering-only WASM, image
decoders, viewer UI and source maps are omitted. The Apache license is reproduced
in `vendor/pdfjs/LICENSE`; character-map and font licenses are reproduced in
`vendor/pdfjs/cmaps/LICENSE`, `vendor/pdfjs/standard_fonts/LICENSE_FOXIT` and
`vendor/pdfjs/standard_fonts/LICENSE_LIBERATION`.

## Mammoth 1.12.2

Official `mammoth` 1.12.2 npm distribution, Michael Williamson, BSD-2-Clause.
The standalone browser bundle (including its dependencies) and license are in
`vendor/mammoth/`. Only `extractRawText` is used, inside a terminable worker;
document HTML is never generated.

Both vendored distributions are reproduced by
`node scripts/vendor-document-readers.mjs`. Each folder's `SOURCE.json` records
the pinned official npm tarball URL, verified SHA-512 package integrity and SHA-256
for every committed asset. This script is maintenance tooling, never runtime code.

## Lucide

The 24-box glyphs of the Network, Security & Edge, and Threats parts in
`src/palette.js` (internet, access point, router, switch, ASN, IP address,
firewall, WAF, proxy, CDN, load balancer, API gateway, threat actor, insider
threat, malware, ransomware, botnet, phishing, C2 server) and the assistant
panel's controls in `src/ui/assistant-ui.js` (sparkles, message-square-plus,
settings-2, x, arrow-up, square, undo-2, scan-search, layout-template,
wrench, file-pen-line, check, circle-alert, circle-check, eye, eye-off) are
icons from [Lucide](https://lucide.dev) (`lucide-static` 1.41.0), used under
the ISC licence below. The Lucide licence also notes which icons descend from the
Feather project under the MIT licence; that notice is reproduced in full.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
