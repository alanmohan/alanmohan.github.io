# Alan Mohan — portfolio

**Live at <https://alanmohan.github.io/>**

A single-page personal portfolio presenting my work in AI-agent evaluation, LLM
interpretability, generative-AI security, applied machine learning and full-stack
AI systems. Built for 15-113 Effective Coding with AI (Project 1), and intended
to keep serving as my public portfolio afterwards.

Static HTML, CSS and JavaScript. No framework, no build step, no backend — it can
be served by opening a file or dropped straight onto GitHub Pages.

---

## Viewing it locally

The page uses relative paths only, so the simplest option works:

```bash
open index.html
```

A local server is closer to how it behaves when deployed, and is what I used for
testing (`localStorage`, which remembers the theme, is restricted on `file://` in
some browsers):

```bash
python3 -m http.server 8113
```

Then visit <http://127.0.0.1:8113/>. Stop it with Ctrl-C.

---

## File structure

```
.
├── index.html                     home: introduction, portrait, experience, contact, colophon
├── projects.html                  tile index + the four write-ups it opens
├── resume.html                    the résumé in an inline viewer, with a download
├── styles.css                     design tokens and layout for all three pages
├── script.js                      theme, navigation, project routing, stepper — all enhancements
├── README.md                      this file
├── prompt-log.md                  required AI-use record for 15-113
└── assets/
    ├── Alan-Mohan-Resume.pdf      the résumé, phone number removed from the text layer
    ├── resume-page-{1,2}{,-650}.webp   pre-rendered pages, used where PDFs cannot embed
    ├── portrait-{400,800,1200}.{jpg,webp}
    ├── portfolio-screenshot-{800,1200}.{png,webp}
    ├── og-image.png               social-sharing card (a real render of the home page)
    ├── favicon.svg
    └── apple-touch-icon.png
```

**Three pages, one stylesheet, one script.** The head, masthead and footer are
repeated in each HTML file rather than assembled by a template, because the whole
point of the setup is that there is no build step. The trade is that a change to
the navigation has to be made in three places.

Three source files stay on my machine and are listed in `.gitignore`, so they are
not published: `Alan_resume_v1_4.pdf` (it still contains a phone number),
`Experience Master.docx` (unpublished project detail), and `pic.jpeg` (the 1.7 MB
original portrait). The published equivalents are `assets/Alan-Mohan-Resume.pdf`,
which has the phone number removed, and the cropped `assets/portrait-*` images.

---

## Design rationale

**The idea: a technical publication, not a landing page.** Everything is arranged
so a technically literate reader can check what I claim. Each section is a margin
rail carrying the heading and its metadata, beside a single comfortable reading
measure, with a wide right gutter that figures break into. The grid is deliberately
left-anchored and asymmetric rather than centred, and it is the same on all three
pages.

**One typographic rule governs the page.** The serif makes claims; the monospace
holds facts you can check — figures, dates, DOIs, venues, dataset names. That rule
is the only reason monospace appears at all, which is what keeps it from becoming
decoration. Typefaces are Newsreader (Production Type) for prose and display, and
IBM Plex Mono for evidence and interface labels. Both are SIL Open Font License.

**Palette.** A pale cool archival stock rather than the warm cream that has become
the default for this kind of page, deep navy-slate ink, and a single oxidised
green accent used only for links, ticks and the active state. Dark mode inverts to
a deep ink ground with the accent brightened. Every value in both themes was
checked for contrast before it was committed (see below).

**The motif** is a measurement scale — a hairline with tick marks. It appears as
the accent tick above each section and page heading, and as the axes inside the
diagrams.
The favicon is the same idea: a probe-accuracy peak over a baseline.

**Projects are indexed, then read.** Four tiles carry only what you need to decide
whether to open one: what kind of work it is, the title, a sentence, and the stack.
Opening a tile replaces the index with the full write-up rather than expanding a
row, so the write-ups can be long without making the index unusable. The tiles are
typographic — a hairline, generous space, and the accent only on the edge under the
pointer — rather than the shadowed rounded cards this pattern usually attracts.

**Diagrams are drawn, not screenshotted.** All four are original inline SVG, so
they inherit the theme rather than shipping as a second set of images, and each is
captioned "Original diagram" so it is never mistaken for a product screenshot. The
one real screenshot on the site is of the site's own home page.

**Motion** happens once on load, as a single short staggered entrance, and
otherwise only in response to a click or a keypress. There are no scroll-triggered
reveals and no hover transforms.

---

## Accessibility decisions

Verified with an automated pass (72 checks) driven through the Chrome DevTools
Protocol, run against all three pages, plus manual inspection at three viewport
widths in both themes.

- **Contrast.** Every foreground/background pair in both themes was computed
  against WCAG 2.1 before being committed. Body ink is 14.1:1 on light and 14.6:1
  on dark; muted text 6.2:1 and 7.2:1; the accent 5.5:1 and 8.2:1. A separate
  `--rule-strong` token (3.3:1 light, 3.3:1 dark) is used for the borders of
  interactive controls so they meet the 3:1 non-text requirement, while the purely
  decorative hairlines stay quiet.
- **Progressive enhancement.** With JavaScript disabled the navigation renders
  fully expanded, the theme follows the operating system, and all five steps of the
  pipeline explainer are visible as an ordered list. The two toggle buttons are
  hidden unless `script.js` has run, so nothing on the page is a control that does
  nothing. The `js` class is set in an inline head script so there is no flash.
- **Keyboard.** Skip link is the first tab stop. Focus order follows the document.
  A single `:focus-visible` treatment (2px accent outline, 3px offset) applies
  everywhere. The mobile menu sets `aria-expanded`, closes on Escape and returns
  focus to its button.
- **Scrollable diagrams.** On narrow screens the wide diagrams scroll inside their
  own box rather than shrinking to illegibility. `script.js` gives a figure
  `tabindex="0"`, a role and a label *only while it actually overflows*, so
  keyboard users can pan it (WCAG 2.1.1) without leaving a dead tab stop on wide
  screens.
- **The project index.** `projects.html` holds the tiles and all four write-ups in
  one document; `script.js` shows one view at a time. Routing runs off the URL
  hash rather than by intercepting clicks, so the tiles stay ordinary links — the
  Back button, opening in a new tab and sharing a link to a single project all keep
  working. Opening a project moves focus to its heading and updates the document
  title; going back returns focus to the tile that was opened. With JavaScript off,
  every write-up simply sits below the tiles that link to it.
- **The résumé viewer.** Desktop browsers get the PDF embedded in an `<object>`.
  Most mobile browsers cannot render one inline, so below 62em the stylesheet swaps
  in pre-rendered page images with full alt text instead of handing phones a blank
  box. Both routes offer the same download.
- **The stepper** announces step changes through `aria-live="polite"`, responds to
  arrow keys, and labels each numbered dot with the step's heading. The diagram
  only dims its inactive stages after someone has actually used the controls, so a
  reader who never interacts still sees the whole pipeline at full strength.
- **Reduced motion.** `prefers-reduced-motion: reduce` neutralises every animation
  and transition and turns off smooth scrolling. Content is never hidden behind an
  animation — the entrance only moves elements that are already in the document.
- **Structure.** One `<h1>`, no heading-level skips, landmark elements throughout,
  every section labelled by its own heading. Informative SVGs carry `role="img"`
  and a full `aria-label`; decorative ones are `aria-hidden`. ARIA is used only
  where native HTML could not do the job.
- **Images** have descriptive alt text, explicit `width`/`height` so nothing shifts
  as they load, WebP with JPEG/PNG fallbacks, `srcset`/`sizes`, and `loading="lazy"`
  below the fold.
- **No horizontal overflow** at 1440px, 768px or 390px — measured, not eyeballed.

---

## Deployment

Deployed from this repository to GitHub Pages: `main` branch, `/ (root)`, served
at <https://alanmohan.github.io/>. Nothing is built — pushing to `main` publishes.

```bash
git add -A && git commit -m "..." && git push
```

Give Pages a minute to rebuild, then hard-reload. If the site ever moves, update
`og:url`, `og:image` and `<link rel="canonical">` in `index.html` to match, or
link previews and search results will keep pointing at the old address.

No `.nojekyll` file is needed — nothing here starts with an underscore.

## Attribution and AI use

**Borrowed assets** — also listed in the page's own colophon, which is the visible
version of this section:

| Asset | Source | Licence |
| --- | --- | --- |
| Newsreader | Production Type, via Google Fonts | SIL Open Font License 1.1 |
| IBM Plex Mono | IBM, via Google Fonts | SIL Open Font License 1.1 |
| Portrait photograph | Sally Maxson, © Carnegie Mellon University — Information Networking Institute student portrait session, 2025 | Used as a CMU student portrait; cropped for this page |

Nothing else is borrowed. There is no CSS framework, JavaScript library, icon set,
illustration pack, template or stock photography. All diagrams, the favicon and
all CSS and JavaScript were written for this project.

**AI use.** The site was built with Claude Code (Claude Opus 5) in an extended
session. AI assistance shaped: the initial architecture and section order; the
exploration of the visual system and its token structure; the responsive strategy;
the JavaScript interactions; and an accessibility and testing pass. Those points
are marked with targeted comments in `index.html`, `styles.css` and `script.js`,
and `prompt-log.md` holds the required conversational record.

All content is mine, drawn from my résumé and my own project notes. Every figure
on the page is attributed to the paper, report or role it came from, and both DOIs
were resolved against CrossRef before being published. I understand the code and
can explain any part of it.

**Measurement note.** The "281 KB first-visit page weight" figure on the page was
measured over the network at 1440px with a cold cache, uncompressed: 11 requests,
of which about 162 KB is the two webfonts. GitHub Pages gzips the HTML, CSS and
JavaScript, so the real figure is lower. If the assets change, re-measure rather
than leaving the number stale.

---

## Known placeholders and missing assets

One item is still outstanding.

| What | Where | What it needs |
| --- | --- | --- |
| **Code link for the IoT intrusion-detection paper** | Its `.case__links` paragraph in `index.html` | A repository was confirmed to exist but no URL was supplied. The spot is marked `PENDING LINK`. |

Two notes, neither of them a placeholder:

- The **sentiment-steering** paper and **HOPE** have no code links because nothing
  is public — HOPE is not open source, and the page says so rather than leaving an
  empty space. No URL is guessed anywhere on the page.
- The **portrait** is a real photograph and the **screenshot** of this site is a
  real render of it. Nothing on the page is a mocked-up or fabricated image.

Three source files stay out of this repository via `.gitignore`:
`Alan_resume_v1_4.pdf` (still contains a phone number), `Experience Master.docx`
(unpublished project detail), and `pic.jpeg` (the 1.7 MB original portrait). The
published equivalents are the redacted `assets/Alan-Mohan-Resume.pdf` and the
cropped `assets/portrait-*` images.

**Optional improvement.** The two webfonts are loaded from Google Fonts, which is
the page's only third-party request. Self-hosting the `.woff2` files in `assets/`
would remove it and cut the weight further; it needs a licence notice alongside
the files, which the OFL already permits.
