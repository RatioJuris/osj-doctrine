/* ============================================================
   THE OSJ DOCTRINE — live markdown renderer + router
   Fetches markdown straight from the repo (OSJ_DOCTRINE.md,
   LICENSE.md, README.md) and renders it client-side. No build
   step: edit the .md, refresh the page, see the change.
   ============================================================ */

(function () {
  "use strict";

  const DOCS = {
    doctrine: { title: "The OSJ Doctrine", path: "./OSJ_DOCTRINE.md", label: "Doctrine" },
    license:  { title: "The OSJ License",  path: "./LICENSE.md",       label: "License"  },
    readme:   { title: "Readme",           path: "./README.md",        label: "Readme"   },
    jjaj:     { title: "Doctrine of Judicial Justice and Absolute Justice", path: "./JJAJ.md", label: "JJAJ" },
  };
  const DEFAULT_DOC = "doctrine";

  const contentEl   = document.getElementById("content");
  const tocEl       = document.getElementById("toc-list");
  const rawLink     = document.getElementById("raw-link");
  const navToggle   = document.getElementById("nav-toggle");
  const docNav      = document.getElementById("doc-nav");
  const docLinks    = document.getElementById("doc-links");
  const backToTop   = document.getElementById("back-to-top");
  const yearEl      = document.getElementById("year");
  const pageTitleEl = document.querySelector("title");

  let currentDoc = DEFAULT_DOC;

  // ---------- small utilities ----------

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function setActiveNav(docKey) {
    document.querySelectorAll("[data-doc-link]").forEach((a) => {
      const isActive = a.getAttribute("data-doc-link") === docKey;
      a.classList.toggle("active", isActive);
      if (isActive) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function closeMobileNav() {
    docLinks.classList.remove("open");
    docNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  // ---------- internal-link rewiring (so .md links render in-page) ----------

  function pathToDocKey(href) {
    const clean = href.replace(/^\.?\//, "").split(/[?#]/)[0].toUpperCase();
    for (const [key, doc] of Object.entries(DOCS)) {
      const docFile = doc.path.replace(/^\.?\//, "").toUpperCase();
      if (clean === docFile) return key;
    }
    return null;
  }

  function rewireInternalLinks() {
    contentEl.querySelectorAll("a[href$='.md'], a[href*='.md#']").forEach((a) => {
      const href = a.getAttribute("href");
      const key = pathToDocKey(href);
      if (!key) return; // unrecognized .md link — leave it as a normal link
      a.setAttribute("href", `#doc/${key}`);
      a.setAttribute("data-doc-link", key);
    });
  }

  function wrapTables() {
    contentEl.querySelectorAll("table").forEach((table) => {
      if (table.parentElement.classList.contains("table-scroll")) return;
      const wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  // ---------- table of contents ----------

  function buildTOC() {
    const headings = contentEl.querySelectorAll("h2, h3");
    if (headings.length === 0) {
      tocEl.innerHTML = '<li><span style="opacity:.6">No sections found</span></li>';
      return;
    }
    const frag = document.createDocumentFragment();
    headings.forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent || "section");
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent.trim();
      if (h.tagName === "H3") a.classList.add("toc-h3");
      li.appendChild(a);
      frag.appendChild(li);
    });
    tocEl.innerHTML = "";
    tocEl.appendChild(frag);
  }

  let scrollObserver = null;

  function wireScrollSpy() {
    if (scrollObserver) scrollObserver.disconnect();
    const links = Array.from(tocEl.querySelectorAll("a"));
    if (links.length === 0) return;
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));

    scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = map.get(entry.target.id);
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach((a) => a.classList.remove("active"));
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    contentEl.querySelectorAll("h2, h3").forEach((h) => scrollObserver.observe(h));
  }

  // ---------- error / 404 states ----------

  function renderError(message, { notFound = false } = {}) {
    contentEl.innerHTML = `
      <div class="state error">
        <strong>${notFound ? "404 — Document not found." : "Something went wrong."}</strong><br>
        ${message}
        <div style="margin-top:1rem;">
          <a href="#doc/${DEFAULT_DOC}">← Back to the OSJ Doctrine</a>
        </div>
      </div>`;
    tocEl.innerHTML = '<li><span style="opacity:.6">Nothing to show</span></li>';
  }

  // ---------- core render ----------

  async function loadDoc(docKey) {
    const doc = DOCS[docKey];

    if (!doc) {
      // Unknown document key in the hash — treat as an in-app 404.
      renderError(`There's no document registered for "<code>${docKey}</code>".`, { notFound: true });
      setActiveNav(null);
      return;
    }

    currentDoc = docKey;
    setActiveNav(docKey);
    if (rawLink) rawLink.setAttribute("href", doc.path);
    if (pageTitleEl) pageTitleEl.textContent = `${doc.title} — The Open Source Journal`;

    contentEl.innerHTML = `<div class="state">Loading ${doc.path}…</div>`;
    tocEl.innerHTML = '<li class="state">Loading…</li>';

    try {
      const res = await fetch(doc.path, { cache: "no-store" });

      if (res.status === 404) {
        renderError(`<code>${doc.path}</code> could not be found on this server (HTTP 404).`, { notFound: true });
        return;
      }
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const raw = await res.text();

      window.marked.setOptions({ gfm: true, breaks: false });
      const html = window.marked.parse(raw);

      contentEl.innerHTML = html;
      rewireInternalLinks();
      wrapTables();
      buildTOC();
      wireScrollSpy();
    } catch (err) {
      renderError(`Could not load <code>${doc.path}</code> (${err.message}). If you're viewing this locally by double-clicking index.html, serve it over HTTP instead — browsers block fetch() on the file:// protocol.`);
      // eslint-disable-next-line no-console
      console.error("OSJ site render failed:", err);
    }
  }

  // ---------- routing ----------

  function parseHash() {
    // Recognized shapes: "#doc/<key>", "#doc/<key>#<anchor>" is not valid HTML hash
    // syntax, so anchors within a doc are just "#<anchor>" once that doc is loaded.
    const h = location.hash.replace(/^#/, "");
    const match = h.match(/^doc\/([\w-]+)$/);
    if (match) return { docKey: match[1], anchor: null };
    if (h && DOCS[currentDoc]) return { docKey: currentDoc, anchor: h };
    return { docKey: DEFAULT_DOC, anchor: null };
  }

  async function handleRoute() {
    const { docKey, anchor } = parseHash();
    if (docKey !== currentDoc || !contentEl.querySelector(":scope > *:not(.state)")) {
      await loadDoc(docKey);
    }
    if (anchor) {
      const target = document.getElementById(anchor);
      if (target) target.scrollIntoView({ block: "start" });
    }
    closeMobileNav();
  }

  window.addEventListener("hashchange", handleRoute);

  // ---------- mobile nav toggle ----------

  navToggle.addEventListener("click", () => {
    const open = docLinks.classList.toggle("open");
    docNav.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });

  // ---------- back-to-top ----------

  function toggleBackToTop() {
    backToTop.classList.toggle("visible", window.scrollY > 480);
  }
  window.addEventListener("scroll", toggleBackToTop, { passive: true });
  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------- footer year ----------

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- boot ----------

  document.addEventListener("DOMContentLoaded", () => {
    toggleBackToTop();
    handleRoute();
  });
})();
