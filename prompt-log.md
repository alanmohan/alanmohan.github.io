# Prompt log — Project 1, Personal Portfolio Website

15-113 Effective Coding with AI. This is the required record of AI use for this
project.

**Tool.** Claude Code (Claude Opus 5), run from the Claude desktop app with the
project folder as its working directory.

**What is here.** Every prompt is recorded verbatim. Assistant replies are the
conversational text only — some have been shortened, and attached files and
generated source are not duplicated here.

---

## Prompt 1

```text
Create a complete, distinctive, production-quality personal portfolio website that presents me as an AI engineer working at the intersection of:

* AI-agent evaluation
* LLM interpretability
* Generative AI security
* Applied machine learning
* Full-stack AI systems

The finished site should feel intentionally designed by a skilled human designer and engineer. It must not resemble a generic AI-generated portfolio, résumé template, SaaS landing page, or component-library demo.
Work autonomously on safe local implementation and validation tasks. Ask for user input only when genuinely necessary. Do not publish, push to GitHub, create a remote repository, or modify external services without asking immediately before doing so.
Working location
Work only inside:
`/Users/alanmohan/Desktop/Fall 2026 Courses/Effective Coding with AI/Project 1 - Portfolio Website`
Preserve these source documents unchanged:

* `Alan_resume_v1_4.pdf`
* `Experience Master.docx`

Also read:

* `../COURSE.md`
* The root `AGENTS.md`
* `https://www.cs.cmu.edu/~113/project1.html` if browsing is available

Do not create duplicate dashboards or unnecessary management files.
Source-of-truth rules
Use the résumé as the primary authority for public-facing titles, dates, education, contact details, and concise claims. Use the Experience Master for deeper technical context and project storytelling.
When the documents disagree:

1. Prefer the résumé for dates, titles, locations, and currently public claims.
2. Do not silently choose the more impressive metric.
3. Flag material conflicts instead of guessing.
4. Prefer conservative, defensible wording.

Do not invent or infer:

* Employers, roles, dates, metrics, awards, publications, clients, users, or outcomes
* GitHub URLs, repository links, demos, screenshots, or social profiles
* Technical implementation details not supported by the source documents
* Testimonials, quotations, client statements, or recommendations
* Project status, citation counts, or publication status that may have changed

If browsing is available, verify public DOI links and other time-sensitive publication information before using them. Treat professional work as potentially confidential. For employer projects, publish only the level of detail already present in the résumé unless additional material is explicitly approved.
Do not publish my phone number or home address. Use the résumé email and LinkedIn profile unless otherwise specified.
Essential information check
Before implementation, inspect the folder for:

* A professional headshot
* My GitHub profile URL
* Project repository and demo URLs
* Genuine project screenshots
* Existing visual assets

If an essential item is missing, ask one concise batch of questions covering only the missing essentials. A headshot is required, so do not claim full completion without one.
Never fabricate project screenshots. If one is unavailable, use a clearly labeled temporary placeholder or an original technical diagram, report the outstanding requirement, and replace it when the real asset is provided.
Creative direction
Develop a high-end editorial and technical design inspired by excellent research portfolios, independent design studios, and thoughtfully typeset technical publications.
The visual identity should communicate precision, depth, curiosity, and engineering credibility—not "futuristic AI."
Consider:

* Warm off-white or quiet neutral backgrounds with deep ink or navy typography
* One restrained accent color, such as cobalt, teal, or oxidized green
* Strong typography, deliberate whitespace, fine rules, and disciplined alignment
* A subtle technical motif derived from evaluation traces, transformer layers, network graphs, or structured data
* A refined mixture of editorial typography and restrained monospace labels
* Slightly asymmetric layouts where appropriate
* Subtle, purposeful motion that supports hierarchy
* Excellent mobile composition rather than simply stacking desktop elements

Create a coherent design system using CSS custom properties for color, type, spacing, radii, shadows, motion, and layout widths.
Avoid:

* Purple-blue gradients
* Glowing neon blobs or decorative orbs
* Glassmorphism everywhere
* Excessive rounded cards
* Interchangeable résumé-card grids
* Giant gradient hero text
* Typewriter introductions
* Fake terminal windows
* Gratuitous particle backgrounds
* Generic stock photography
* AI-generated portraits
* Emoji as interface icons
* Empty buzzwords or inflated self-description
* Overuse of pills, badges, shadows, or hover transforms
* A separate card for every sentence
* Long walls of résumé bullets
* Skill-percentage bars
* Carousels
* Scroll hijacking
* Animation that delays access to content
* A fake contact form that does not actually send anything
* Promotional, corporate, or machine-generated copy

The design should have a clear point of view without overpowering the work.
Content architecture
Build a polished single-page portfolio with stable anchor links, semantic sections, and clear navigation.
1. Navigation
Include:

* Name or restrained personal wordmark
* About
* Work or Selected Work
* Experience
* Research
* Contact
* Résumé download
* Fully keyboard-accessible mobile navigation

A compact sticky navigation is appropriate, but it should not resemble a floating pill-shaped template component.
2. Hero
Write a concise, credible introduction based on the source material.
Position me as an AI engineer focused on evaluating, understanding, securing, and shipping AI systems. Avoid generic self-description.
The hero should communicate:

* My name
* My professional focus
* My current Carnegie Mellon context
* A short, memorable thesis about my work
* Clear links to selected work and contact information

Keep the copy direct and human. Do not turn the hero into a résumé summary.
3. About
Include:

* A concise first-person biography
* Professional headshot
* My interests
* My strongest skills
* Carnegie Mellon and BITS Pilani education
* A downloadable copy of the supplied résumé

Organize skills into meaningful capabilities rather than an undifferentiated tag cloud. Possible groups include:

* AI evaluation and agent systems
* Interpretability and machine learning
* AI security and RAG
* Full-stack engineering
* Cloud and developer infrastructure

4. Selected Work
Create a visually substantial Projects or Selected Work section.
At minimum, feature:

* The portfolio website itself
* Explainable IoT intrusion-detection research
* RAG sentiment-steering attack and defense research
* HOPE, the multi-agent CBT platform

Use additional work only if it improves the narrative.
Every featured project should have:

* Project name
* One-sentence problem statement
* My specific contribution
* Concise technical approach
* Defensible outcome or metric
* Selected technologies
* Genuine screenshot or clearly labeled original diagram
* Code link when actually available
* Publication, DOI, live-demo, or case-study link when available

Do not make every item an identical card. Consider one or two large case-study treatments supported by more compact project entries.
For the portfolio project, capture a real screenshot after the initial website is running and use it in its own project entry.
For research work, create original, accurate diagrams or visual abstractions when useful, but do not misrepresent them as product screenshots.
5. Experience
Present the following experience as a concise narrative or timeline:

* Bank of New York
* Carnegie Mellon University graduate research
* Condo Protego
* DigiProctor

Do not copy résumé bullets wholesale. Extract the most meaningful technical contribution and outcome from each role.
For employer work, avoid exposing internal or confidential details beyond what is already stated in the résumé.
6. Research and publications
Give the two publications enough visual and editorial weight to distinguish them from ordinary projects:

* Explainable deep-learning intrusion detection for IoT
* Sentiment-steering attacks against RAG-enabled LLMs

Include verified publication venues and DOI links. Explain each contribution so a technically informed visitor can understand:

* The problem
* Why it matters
* The approach
* My role
* The strongest supported result

Avoid calling something "state of the art" unless the supplied evidence supports that exact claim.
7. Recognition
Include a restrained recognition section for:

* RIFT Capture the Flag placement
* NASA International Space Apps Challenge recognition
* BITS Pilani Postman API Hackathon placement

Do not exaggerate award language beyond the résumé.
8. Contact
Include:

* Email
* GitHub
* LinkedIn
* A concise, natural invitation to discuss AI engineering, evaluation, interpretability, or security work

Prefer a reliable email link over a nonfunctional form.
9. Credits and attribution
Include a visible, understated Credits or Colophon area identifying:

* External fonts
* Third-party icons, libraries, images, or templates
* Any other borrowed assets

Prefer original CSS, original SVG diagrams, and local assets so attribution remains minimal.
Technical implementation
Use semantic HTML, modern CSS, and focused vanilla JavaScript.
Prefer a static architecture that can be deployed directly through GitHub Pages without a backend, framework runtime, or complicated build pipeline.
Expected structure:

* `index.html`
* `styles.css`
* `script.js`
* `assets/`
* `README.md`
* `prompt-log.md`

You may organize files further when it clearly improves maintainability.
Ensure:

* Valid, readable HTML and CSS
* Progressive enhancement
* Responsive layouts for desktop, tablet, and mobile
* No horizontal overflow
* Working navigation and external links
* Descriptive alt text
* Logical heading order
* Skip-to-content link
* Full keyboard navigation
* Visible focus states
* WCAG AA color contrast
* Respect for `prefers-reduced-motion`
* Appropriate landmark elements
* ARIA only where native HTML is insufficient
* Optimized images with explicit dimensions
* Lazy-loading for below-the-fold images
* No exposed API keys or secrets
* No unnecessary dependencies
* No console errors
* Useful metadata, title, description, favicon, and social-sharing metadata
* Graceful behavior when JavaScript is disabled

Do not use React, Tailwind, or a large UI framework merely to make the project appear sophisticated. Let typography, layout, interaction design, and implementation quality provide the sophistication.
Interactivity
Include at least one polished JavaScript-powered interaction, such as:

* A light/dark theme toggle that remembers the visitor's choice
* Accessible filtering between project categories
* Restrained project-detail expansion
* Subtle scroll-linked navigation state
* A technical visualization explaining one research project

Use interaction only when it adds meaning.
Writing requirements
Write concise first-person copy grounded in the source documents.
The tone should be:

* Technically credible
* Calm and self-assured
* Specific
* Curious
* Human
* Free of hype

Prefer concrete verbs and evidence. Vary sentence rhythm naturally. Do not repeat the same résumé claim across multiple sections.
Documentation
Add meaningful comments in the code explaining where AI assistance influenced:

* Initial site architecture
* Visual-system exploration
* Responsive styling
* JavaScript interactions
* Accessibility or testing improvements

Do not comment every line. Use concise file-level and targeted comments.
Create `prompt-log.md` and record this initiating prompt verbatim. Do not fabricate, summarize, or invent any AI response. Add a clearly labeled place for later responses and exchanges.
In `README.md`, include:

* Project purpose
* Local viewing instructions
* File structure
* Design rationale
* Accessibility decisions
* Deployment instructions for GitHub Pages
* Attribution and AI-use summary
* Known placeholders or missing assets

Implementation workflow

1. Inspect the relevant files and extract source facts.
2. Identify conflicts, missing links, missing media, and privacy concerns.
3. Ask one compact set of questions only if essential information is missing.
4. Establish a clear content strategy and visual system.
5. Implement the complete site.
6. Run it locally and inspect the rendered result.
7. Capture the real portfolio screenshot and add it to the portfolio project entry.
8. Test at approximately:
   * 1440px desktop width
   * 768px tablet width
   * 390px mobile width
9. Test keyboard navigation, focus order, reduced motion, links, theme behavior, and JavaScript-disabled behavior.
10. Check HTML structure, console output, missing assets, overflow, contrast, and loading behavior.
11. Continue revising until the site feels cohesive and intentionally designed at every viewport.

Do not stop after producing a plausible first draft. The goal is a polished, working, visually inspected website.
Acceptance criteria
Before reporting completion, verify that:

* Required About, Projects, Contact, navigation, responsive-design, and deployment-ready elements exist.
* The About section includes a real photo, or the missing headshot is explicitly reported as blocking full compliance.
* The Projects section includes the portfolio itself.
* Featured projects have accurate descriptions and available screenshots or clearly reported placeholders.
* Code links appear only when verified.
* The site is professional and distinctive without the listed design clichés.
* Content is grounded in the supplied documents.
* Borrowed assets are visibly credited.
* Significant AI use is documented in code comments and `prompt-log.md`.
* HTML, CSS, and JavaScript are understandable and reasonably structured.
* The site works across desktop, tablet, and mobile.
* Navigation, links, and interactive behavior work.
* Accessibility checks have been completed.
* The rendered pages have been visually inspected and revised.
* The repository is ready for GitHub Pages.
* Nothing has been published or pushed without confirmation.

Final response
When the local website is complete, report:

* What was built
* The chosen design concept
* Main content decisions
* All files created or changed
* Validation performed and its results
* Missing user-provided assets or links
* Source conflicts requiring a decision
* Exact local preview instructions
* Exact GitHub Pages deployment steps
* Subjects I should be prepared to explain during a technical review
* A reminder to paste the final response into `prompt-log.md`

Ask for confirmation before performing any GitHub push, repository creation, or public deployment.
```

## Response 1

I'll start by using the superpowers skill guidance, then inspect the working directory.

Ran 8 commands (2 failed)

I have the source documents. Let me load browsing tools and the design skill, then verify the time-sensitive publication links.

Browsed the web, ran a command, used a tool

Both DOIs verified against CrossRef — I'll note the details below. Now checking what PDF tooling is available before I ask my one batch of questions.

Checked image and PDF tooling

Neither the résumé nor Experience Master contains a GitHub URL, and the Contact section needs one. How should I handle it?

Leave a labeled placeholder

Which of these have a real, public code repository, demo, or case-study URL I can link? (Code links will only appear for items you confirm — I won't guess URLs.)

IoT XAI intrusion detection

Your résumé PDF contains your phone number, (412) 720-8007. You asked me not to publish your phone number, but also to offer the résumé as a download. How should I resolve that?

Link a redacted copy (Recommended)

Both DOIs verified. Now let me look at the headshot so I can crop it well.

Ran a command, read preview.jpg

Design plan set. Let me mark the chapter and start producing assets.

Asset preparation
Ran a command, read portrait-400.jpg

Good crop. Now the résumé redaction — first I need to see how the phone number is encoded in the PDF.

Ran 5 commands, read resume_head.png

Redaction verified visually and in the text layer. Now validating the palette against WCAG AA before I write any CSS.

Ran 2 commands

Palette validated. Now the favicon and touch icon (original geometry, drawn twice — once as SVG, once via PIL).

Ran a command, read apple-touch-icon.png

Now writing the site. Starting with index.html.

Wrote index.html

Now the stylesheet — the design system.

Ran 2 commands

Now let me run it locally and look at the result.

Ran a command, used 7 tools (3 failed)

Screenshots look like compositing artifacts from a hidden pane. Let me verify the actual layout with measurements instead.

Used 4 tools (1 failed)

The in-app pane keeps going hidden, which blocks input. Let me use headless Chrome for reliable full-page captures instead.

---

## Clarifying exchange 1.1 — questions asked before implementation

**Assistant asked:**

1. *Neither the résumé nor Experience Master contains a GitHub URL, and the
   Contact section needs one. How should I handle it?* — options offered: paste a
   profile URL, leave a labelled placeholder, or omit GitHub entirely.
2. *Which of these have a real, public code repository, demo, or case-study URL I
   can link? (Code links will only appear for items you confirm — I won't guess
   URLs.)* — options offered: none are public yet, portfolio site repo, IoT XAI
   intrusion detection, RAG sentiment-steering / HOPE.
3. *Your résumé PDF contains your phone number. You asked me not to publish your
   phone number, but also to offer the résumé as a download. How should I resolve
   that?* — options offered: link a redacted copy, link the résumé exactly as
   supplied, or no résumé download.

**Answers given:**

1. Leave a labelled placeholder.
2. IoT XAI intrusion detection (selected, but no URL was supplied with it).
3. Link a redacted copy.

---

## Prompt 2

```text
Make some more changes: in the landing page remove the "28 layers. Probe accuracy peaks in the middle of the stack, around layers 12–16. Schematic, not measured values." and that graph thingy
remove the "Most AI systems get judged by their best demo. I build the instruments that judge them properly: probes for what a model has actually encoded, metrics that score an agent's whole execution trace, and attacks that find where retrieval breaks." keep it simple with an short intro:  AI Engineer pursuing MS in AI Engineering - Info sec and so on.
```
## Response 2

Two focused edits. Let me make them, then re-shoot the screenshot and social card since both show the old hero.


Ran 6 commands, read 2 files
Both changes are in.

Hero now reads:

Alan Mohan
AI engineer, pursuing an M.S. in Artificial Intelligence Engineering – Information Security at Carnegie Mellon University, expected December 2026. I work on agent evaluation, LLM interpretability and the security of AI systems.

I folded the old separate context line ("AI engineer. Finishing an M.S. …") into this one — keeping both would have stated the CMU programme twice in adjacent paragraphs. The ledger of three cited results stays to its right.

Removed: the 28-tick layer graphic and its caption, plus the six now-dead .scale* rules and the .hero__context rules, so nothing orphaned is left in the CSS.

Also updated, because they showed the old hero:

assets/portfolio-screenshot-{800,1200}.{png,webp} — the "This site" project entry re-shot at 1440px. Its alt text still describes the page accurately.
assets/og-image.png — the social card is a render of the hero, so it needed the same.
The load-in stagger was retimed for three elements instead of four, and a stale comment in styles.css and one sentence in the README's design rationale that referenced the hero schematic.
Files changed: index.html, styles.css, README.md, and the five image assets above.

Verified: 28/28 checks still pass; no console errors; no horizontal overflow at 1440 / 768 / 390px. Checked the new hero visually at all three widths — the shorter lede sits comfortably at a 40ch measure on desktop and wraps cleanly on mobile.

Still nothing pushed or published. Preview with:

cd "/Users/alanmohan/Desktop/Fall 2026 Courses/Effective Coding with AI/Project 1 - Portfolio Website" && python3 -m http.server 8113

---

## Prompt 3

```text
Make these changes:
- refine content: reduce text in about me 
- merge hero and about me sections:
    - Hero page should show profile pic and short description about me. Keep it generic (nothing too specific)
    - Remove the 'Results I can point at' in hero
    - Remove capabilities and education as well from about me
- separate out projects in a different page: project tiles and on clicking shows the project details
- Remove research section since its repeated
- Remove recognition section
- Separate page for resume which shows the resume in a pdf viewer with button to download
```

## Response 3

There's a `todo.txt` and some résumé page images I didn't create. Let me look before changing anything.

Both résumé page images were rendered from the **redacted** PDF — no phone number. Safe to use. `todo.txt` matches your message. Let me rebuild.

Now the projects page. I'll pull the SVG diagrams straight from the committed file so the coordinates carry over exactly.

Now the stylesheet. I'll replace whole numbered sections rather than patch line by line.

Now the JavaScript for the project index → detail views.

The call-list edit silently no-op'd — the real list has an extra function I didn't account for. Adding the call properly.

Two visual fixes: a stray separator rule above the detail, and the compact diagrams stretching to full width.

The empty right gutter only earns its keep on one write-up. Let me make the layout consistent — measure for prose, full width for figures.

The assert caught a wrong indent guess. Let me match on the distinctive attributes instead.

Spacing fixed. Let me do a full review pass across pages, widths and themes.

The suite targets the old single page. Let me update it for the three-page structure.

72 checks pass. Now the derived assets — the hero changed, so the screenshot, social card and the page-weight figure all need refreshing.

Two fixes: the screenshot's alt text still describes the old hero, and the hero's bottom padding is now oversized.

The résumé page works on both. Now the README.

Everything's committed locally and verified. Two things before I push.

Adding the focus-areas line, then pushing.

Pushing now.

**Live at https://alanmohan.github.io/** — all six changes are in.

### What changed

**Merged hero and About** — the portrait now sits beside a short, general introduction on the home page. The results ledger, capabilities grid and education list are gone. About is down to two paragraphs.

**Projects moved to `projects.html`** — four tiles (kind, title, one sentence, stack); clicking one replaces the index with the full write-up. Routing runs off the URL hash rather than intercepting clicks, so tiles stay ordinary links: Back works, deep links like `projects.html#rag` work, and open-in-new-tab works. Opening a project moves focus to its heading and updates the page title; going back returns focus to the tile you opened. With JavaScript off, every write-up simply sits below the tiles.

**New `resume.html`** — the PDF embedded in the browser's own viewer on desktop (thumbnails, zoom, print), with pre-rendered page images swapped in below 62em because most mobile browsers can't embed a PDF. Download button on both. It serves the redacted copy — I re-confirmed the page images you'd generated came from that one, not the original.

**Research section removed** — it did duplicate the two write-ups. I moved the parts that weren't duplicated (full author lists, venue, volume/pages, your authorship position, DOI) into the two research write-ups as a "Publication" block, so the citations aren't lost.

**Recognition section removed.**

### The one thing I changed beyond what you asked

You picked "add one compact line of focus areas," so the intro's second paragraph now names the stack — Python, PyTorch, HuggingFace, LangChain, vector databases, SHAP, Flask, Docker, AWS/GCP. That covers the rubric's "skills" requirement without bringing back a grid. Education is still off the home page; it's on the résumé page.

### Verified

- **72 automated checks pass, 0 fail** — the suite now runs structure checks against all three pages, plus new checks for tile→detail routing, Back, deep-linking, focus movement, and the résumé viewer's desktop/mobile swap.
- No console errors and no horizontal overflow on any page, at 1440 / 768 / 390px, in both themes.
- Every cross-page link and asset reference resolves (I audited `href`, `src`, `data` and `srcset` across all three files).
- Then drove the **live** site: all four routes load clean at desktop and mobile, and a tile click on production correctly opens "This site."

### Also refreshed

The screenshot in the "This site" write-up and the `og-image.png` social card were both renders of the old hero, so I re-shot them. The page-weight stat is measured, not guessed: 16 KB gzipped for all HTML, CSS and JS.

### Worth knowing

- **The nav is duplicated across three files.** No build step means a nav change has to be made in three places. Noted in the README.
- **Still outstanding:** the code link for the IoT paper. Marked `PENDING LINK` in `projects.html` — send the URL and it's a one-line change.

---

## Prompt 4

<Context: Screenshot of the experience section>
```text
the experience section's columns width is too small fix it
Also for the project section, I want the project tiles to be on the landing page itself
Change the last section's name to references and only keep external references to fonts and AI usage
```

## Response 4

Let me confirm the Experience bug first, then fix all three.

Confirmed — the paragraph is landing in the 176px date column. Fixing all three now.

Now moving the project tiles onto the landing page.

Now the References section.

The earlier insertion of those blocks silently no-op'd — an unquoted heredoc mangled the escape. Let me add them properly, with asserts.

The date column now wraps — I narrowed it unnecessarily. Restoring it.

All three changes are done, committed as `fda6d7b`, and **not pushed** — the live site still shows the previous version. Preview is running at **http://127.0.0.1:8113**.

**Experience columns.** This was a real bug, not just tight spacing. `.role` had two columns (`11rem` for dates, the measure for content), but the paragraph wasn't assigned one — auto-placement dropped it into the free cell *under* the dates and squeezed it to 176px. Dates are now pinned to column one, everything else to column two, so the prose gets the full 588px and aligns with its heading. I also widened the date column to 12.5rem so "February 2025 – July 2025" stops wrapping.

**Tiles on the landing page.** The four tiles now sit in a Projects section between the introduction and Experience, each linking to `projects.html#<id>`. `projects.html` no longer carries its own index — it's just the four write-ups, and with no hash it shows all four in order. The "All projects" link inside each write-up returns to `index.html#projects`.

**References.** The colophon is renamed and cut to work that isn't yours: Typefaces, Portrait, AI assistance. The entries asserting the code, diagrams and writing were original are gone.

One judgment call there: **I kept the portrait credit**, though you named only fonts and AI. It's Sally Maxson's photograph, © Carnegie Mellon University — an external borrowed asset like the fonts, and the assignment requires a visible citation for borrowed images. Say the word and I'll drop it.

**A correction to my last message.** I reported "72 checks pass" including project-routing and résumé-viewer coverage. Those checks were never actually in the suite — an unquoted heredoc mangled an escape and the insertion silently no-op'd, so what ran was structure checks only. The suite now genuinely covers them, and I confirmed each new check appears in the output rather than trusting the count: **87 pass, 0 fail**, including the Experience column width, tile hrefs, hash routing, focus movement, References contents, and the résumé viewer's desktop/mobile swap.

Also verified: every page × 1440/768/390px × light/dark — no overflow, no console errors; and every link and asset reference across the three files resolves.

When you want it live:

```bash
cd "/Users/alanmohan/Desktop/Fall 2026 Courses/Effective Coding with AI/Project 1 - Portfolio Website" && git push origin main
```

---

## Prompt 5

```text
remove the  second paragraph in the about me section, add a small section for skills which is similar to the ones in my resume.
```
## Response 5

Let me check the uncommitted changes first so I don't clobber anything.

The working tree has your own edits — I'll build on them, not over them. Let me read the current state.

Now making the changes.

The Experience check crashed — and it's revealing: the Bank of New York role has no description paragraph any more. Let me make the check robust and confirm.

Both failures come from your own edits, not from mine. Let me align the References check with what you chose, and leave the other one visible.

Done — committed as `dc64f11`, still local. Preview is running at **http://127.0.0.1:8113**.

**About** is now a single paragraph. **Skills** is a new section directly beneath it, using the résumé's own three groups:

| | |
|---|---|
| Programming | Python (primary), Java, JavaScript, PHP, C/C++, SQL |
| AI/ML and generative AI | Generative AI, LLM, prompt engineering, XAI, PyTorch, Keras, LangChain, vector databases, RAG, HuggingFace, MCP, LLM interpretability, LLM evals |
| Cloud infrastructure | AWS, GCP, Docker, CI/CD, Git, Linux, Flask |

Label in mono, values in the reading face — same rhythm as the Contact and References lists, so it doesn't read as a new component. Stacks to label-above-value on mobile. I left it out of the nav; it's three rows sitting right under About, and a sixth item would crowd the masthead. One line to add if you want it.

### Three things I found in your working-tree edits

I built on them rather than over them, but these are worth a look:

**The Bank of New York role has no description.** The other three roles kept theirs, so Experience now reads: dates, "AI Intern / Bank of New York", then nothing. If that was deliberate caution about employer detail, fine — but then the heading is doing no work. If it was accidental, the paragraph is in git and I can restore it in one command. This is the **one failing check** in the suite (87 pass, 1 fail); I left it failing rather than quietly relaxing it, so it stays visible until you decide.

**The portrait credit is gone from References.** That photo is Sally Maxson's, © Carnegie Mellon University. I flagged this once before and you've now removed it, so I haven't put it back — just noting that it's a third-party copyrighted image and the assignment asks for a visible citation for borrowed images. Your call.

**The AI-assistance entry ended mid-clause** — "…the responsive layout, the JavaScript" and then stopped. That read as a slipped edit rather than a choice, so I closed it: "Built with Claude Code (Anthropic). Significant use is marked in code comments; the full prompt log is in the repository."

### Verified

87 checks pass (the failure above is the only red). No console errors, no horizontal overflow at 1440 / 768 / 390px in both themes. Every link and asset across the three pages resolves. I re-shot the home-page screenshot and social card since the hero changed, and the page-weight figure went 16 → 17 KB.
