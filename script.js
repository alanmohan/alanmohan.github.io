/* =============================================================================
   Alan Mohan — portfolio behaviour

   Five enhancements, in order of how much they matter:
     1. theme      — light/dark, remembered across visits
     2. navigation — mobile menu, and a current-section state in the nav
     3. projects   — turns the tile index and the four write-ups on projects.html
                     into two views, keeping the URL and the Back button honest
     4. stepper    — turns the five written steps under the RAG diagram into a
                     walkthrough that highlights the matching part of the SVG
     5. masthead   — a hairline shadow once the page has scrolled

   Everything here is an enhancement. With JavaScript disabled the navigation is
   fully expanded, the theme follows the operating system, every project write-up
   sits below the tiles that link to it, and all five stepper entries are visible
   as an ordered list. Nothing is hidden by CSS unless this file has run and
   marked the document.

   AI assistance (Claude): drafted the IntersectionObserver approach for the
   current-section state and the stepper's keyboard and aria-live handling. Both
   were reworked here — the observer band was retuned so short sections still
   register, and the stepper was rewritten to build its controls from the markup
   that already exists rather than from a JavaScript array of content.
   ============================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- theme -- */
  var THEME_KEY = 'am-theme';

  function readStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function storeTheme(value) {
    try { localStorage.setItem(THEME_KEY, value); } catch (e) { /* storage unavailable */ }
  }
  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || systemTheme();
  }

  function setUpTheme() {
    var button = document.getElementById('theme-toggle');
    var label = document.getElementById('theme-toggle-label');
    if (!button || !label) return;

    function paint() {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      label.textContent = next === 'dark' ? 'Dark theme' : 'Light theme';
      // The visible label is a substring of the accessible name (WCAG 2.5.3).
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      button.querySelector('.tt-fill').setAttribute(
        'd', next === 'dark' ? 'M8 1.5h6.5v13H8z' : 'M1.5 1.5H8v13H1.5z'
      );
    }

    button.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      storeTheme(next);
      paint();
    });

    // Follow the OS while the visitor has not made an explicit choice.
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (!readStoredTheme()) paint(); };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }

    paint();
  }

  /* ----------------------------------------------------------- navigation -- */
  function setUpNav() {
    var masthead = document.querySelector('.masthead');
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!masthead || !toggle || !nav) return;

    var desktop = window.matchMedia('(min-width: 62em)');

    function close(returnFocus) {
      masthead.setAttribute('data-nav-open', 'false');
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }
    function open() {
      masthead.setAttribute('data-nav-open', 'true');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') close(false);
      else open();
    });

    // A link inside the panel has done its job the moment it is followed.
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) close(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        close(true);
      }
    });

    // Widening past the breakpoint reveals the nav anyway; drop the open state
    // so it is not left behind when the viewport narrows again.
    var onDesktopChange = function () { if (desktop.matches) close(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onDesktopChange);
    else if (desktop.addListener) desktop.addListener(onDesktopChange);

    close(false);
  }

  /* Marks the nav link for whichever section is currently under the reader's
     eye. The band is deliberately narrow and sits high in the viewport so the
     state changes once per section rather than flickering between two. */
  function setUpCurrentSection() {
    var links = Array.prototype.slice.call(
      document.querySelectorAll('.site-nav a[href^="#"]')
    );
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    var targets = [];
    links.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var section = document.getElementById(id);
      if (!section) return;
      map[id] = link;
      targets.push(section);
    });
    if (!targets.length) return;

    var visible = {};

    function paint() {
      var active = null;
      for (var i = 0; i < targets.length; i++) {
        if (visible[targets[i].id]) { active = targets[i].id; break; }
      }
      links.forEach(function (link) {
        var id = link.getAttribute('href').slice(1);
        if (id === active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      paint();
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

    targets.forEach(function (section) { observer.observe(section); });
  }

  /* ------------------------------------------------------------- projects -- */
  /* projects.html holds both the tile index and all four write-ups. Routing is
     done off the URL hash rather than by intercepting clicks, so the tiles stay
     ordinary links: the Back button, opening in a new tab and sharing a link to
     one project all keep working for free. */
  function setUpProjectViews() {
    var index = document.getElementById('project-index');
    var details = document.getElementById('project-details');
    if (!index || !details) return;

    var projects = Array.prototype.slice.call(details.querySelectorAll('.project'));
    if (!projects.length) return;

    var indexTitle = document.title;
    var lastOpened = null;

    function scrollToTop() {
      // A view swap should land at the top instantly; the smooth scrolling in the
      // stylesheet is for in-page anchors, not for changing what is on screen.
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function showIndex(moveFocus) {
      projects.forEach(function (project) { project.hidden = true; });
      details.hidden = true;
      index.hidden = false;
      document.title = indexTitle;

      if (moveFocus && lastOpened) {
        // Return the reader to the tile they opened, not to the top of the list.
        var tile = index.querySelector('.tile__h a[href="#' + lastOpened + '"]');
        if (tile) tile.focus();
      }
      scrollToTop();
    }

    function showProject(id, moveFocus) {
      var target = null;
      projects.forEach(function (project) {
        var wanted = project.id === id;
        project.hidden = !wanted;
        if (wanted) target = project;
      });
      if (!target) { showIndex(false); return; }

      index.hidden = true;
      details.hidden = false;
      lastOpened = id;

      var heading = target.querySelector('.case__h');
      document.title = (heading ? heading.textContent.trim() + ' — ' : '') + 'Alan Mohan';
      if (moveFocus && heading) heading.focus({ preventScroll: true });
      scrollToTop();
    }

    function route(moveFocus) {
      var id = window.location.hash.replace('#', '');
      var isProject = projects.some(function (project) { return project.id === id; });
      if (isProject) showProject(id, moveFocus);
      else showIndex(moveFocus && id === 'project-index');
    }

    window.addEventListener('hashchange', function () { route(true); });
    route(false);
  }

  /* -------------------------------------------------------------- stepper -- */
  function setUpSteppers() {
    var steppers = document.querySelectorAll('[data-stepper]');

    Array.prototype.forEach.call(steppers, function (stepper) {
      var list = stepper.querySelector('.stepper__list');
      var steps = Array.prototype.slice.call(stepper.querySelectorAll('.step'));
      if (!list || steps.length < 2) return;

      var figure = stepper.closest('figure');
      var stages = figure
        ? Array.prototype.slice.call(figure.querySelectorAll('[data-stage]'))
        : [];

      var index = 0;

      var controls = document.createElement('div');
      controls.className = 'stepper__controls';

      var previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'stepper__btn';
      previous.textContent = 'Previous';

      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'stepper__btn';
      next.textContent = 'Next';

      var dots = document.createElement('div');
      dots.className = 'stepper__dots';
      dots.setAttribute('role', 'group');
      dots.setAttribute('aria-label', 'Jump to a step');

      var dotButtons = steps.map(function (step, i) {
        var heading = step.querySelector('h4');
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'stepper__dot';
        dot.textContent = String(i + 1);
        dot.setAttribute('aria-label',
          'Step ' + (i + 1) + (heading ? ': ' + heading.textContent.trim() : ''));
        dot.addEventListener('click', function () { show(i, true); });
        dots.appendChild(dot);
        return dot;
      });

      function show(i, fromUser) {
        // The diagram only starts dimming its inactive stages once someone has
        // actually used the controls; before that it reads as a whole.
        if (fromUser && figure) figure.classList.add('is-stepping');
        index = Math.max(0, Math.min(steps.length - 1, i));
        steps.forEach(function (step, n) { step.classList.toggle('is-active', n === index); });
        dotButtons.forEach(function (dot, n) {
          if (n === index) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
        stages.forEach(function (stage) {
          stage.classList.toggle('is-active',
            stage.getAttribute('data-stage') === String(index + 1));
        });
        previous.disabled = index === 0;
        next.disabled = index === steps.length - 1;
      }

      previous.addEventListener('click', function () { show(index - 1, true); });
      next.addEventListener('click', function () { show(index + 1, true); });

      // Arrow keys work anywhere inside the figure, which is where a keyboard
      // user's focus already is after tabbing to the controls.
      stepper.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight') { show(index + 1, true); event.preventDefault(); }
        if (event.key === 'ArrowLeft') { show(index - 1, true); event.preventDefault(); }
      });

      controls.appendChild(previous);
      controls.appendChild(next);
      controls.appendChild(dots);
      stepper.appendChild(controls);

      list.setAttribute('aria-live', 'polite');
      stepper.classList.add('is-enhanced');
      if (figure) figure.classList.add('is-enhanced');
      show(0);
    });
  }

  /* Diagrams that are wider than a phone screen scroll sideways. A scrollable
     region has to be reachable by keyboard (WCAG 2.1.1), but only while it is
     actually scrollable — otherwise it is a tab stop that does nothing.
     (AI assistance: Claude flagged this during an accessibility pass.) */
  function setUpScrollableFigures() {
    var boxes = Array.prototype.slice.call(
      document.querySelectorAll('.pipeline, .diagram')
    ).filter(function (box) { return !box.classList.contains('shot'); });
    if (!boxes.length) return;

    function sync() {
      boxes.forEach(function (box) {
        var scrolls = box.scrollWidth > box.clientWidth + 1;
        if (scrolls) {
          var caption = box.querySelector('figcaption');
          box.setAttribute('data-scrollable', '');
          box.setAttribute('tabindex', '0');
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label',
            (caption ? caption.textContent.trim() : 'Diagram') + ' Scrollable sideways.');
        } else {
          box.removeAttribute('data-scrollable');
          box.removeAttribute('tabindex');
          box.removeAttribute('role');
          box.removeAttribute('aria-label');
        }
      });
    }

    var pending;
    window.addEventListener('resize', function () {
      clearTimeout(pending);
      pending = setTimeout(sync, 150);
    }, { passive: true });
    sync();
  }

  /* ------------------------------------------------------------- masthead -- */
  function setUpMasthead() {
    var masthead = document.querySelector('.masthead');
    if (!masthead) return;
    var ticking = false;

    function update() {
      masthead.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  setUpTheme();
  setUpNav();
  setUpCurrentSection();
  setUpProjectViews();
  setUpSteppers();
  setUpScrollableFigures();
  setUpMasthead();
})();
