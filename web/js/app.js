/* ============================================================
   THE OSJ DOCTRINE — live markdown renderer
   Fetches OSJ_DOCTRINE.md from the repo root and renders it
   client-side. No build step, no server: what you edit in the
   .md file is what appears on the page.
   ============================================================ */

(function () {
  "use strict";

  const SOURCE_PATH = "./OSJ_DOCTRINE.md";
  const contentEl = document.getElementById("content");
  const tocEl = document.getElementById("toc-list");

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  /**
   * Pulls footnote definitions (e.g. "[^1]: some text") out of the
   * raw markdown, and rewrites inline "[^1]" references into markdown
   * links that resolve to real anchors once rendered.
   */
  function extractFootnotes(md) {
    const defs = new Map();
    const defPattern = /^\[\^([\w-]+)\]:\s*(.+)$/gm;

    const withoutHeading = md.replace(/^#{1,6}\s+footnotes\s*$/gim, "");

    const withoutDefs = withoutHeading.replace(defPattern, (match, id, text) => {
      defs.set(id, text.trim());
      return "";
    });

    let order = [];
    const withRefs = withoutDefs.replace(/\[\^([\w-]+)\]/g, (match, id) => {
      if (!defs.has(id)) return match; // not a real footnote ref, leave as-is
      if (!order.includes(id)) order.push(id);
      const n = order.indexOf(id) + 1;
      return `<sup id="fnref-${id}"><a class="fnref" href="#fn-${id}" aria-label="Footnote ${n}">[${n}]</a></sup>`;
    });

    return { body: withRefs, defs, order };
  }

  function renderFootnotesHTML(defs, order) {
    if (order.length === 0) return "";
    const items = order
      .map((id, i) => {
        const n = i + 1;
        const raw = defs.get(id) || "";
        const text = raw.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)/g, "$1<$2>");
        const parsed = window.marked.parseInline(text);
        return `<li id="fn-${id}">${parsed} <a class="back" href="#fnref-${id}" aria-label="Back to reference ${n}">↩</a></li>`;
      })
      .join("\n");
    return `<div class="footnotes"><h2>Footnotes</h2><ol>${items}</ol></div>`;
  }

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
      a.textContent = h.textContent.replace(/^\d+\s*[—-]\s*/, "").trim();
      if (h.tagName === "H3") a.classList.add("toc-h3");
      li.appendChild(a);
      frag.appendChild(li);
    });
    tocEl.innerHTML = "";
    tocEl.appendChild(frag);
  }

  function wireScrollSpy() {
    const links = Array.from(tocEl.querySelectorAll("a"));
    if (links.length === 0) return;
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));

    const observer = new IntersectionObserver(
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

    contentEl.querySelectorAll("h2, h3").forEach((h) => observer.observe(h));
  }

  async function render() {
    try {
      const res = await fetch(SOURCE_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const raw = await res.text();

      const { body, defs, order } = extractFootnotes(raw);

      window.marked.setOptions({ gfm: true, breaks: false });
      const html = window.marked.parse(body);
      const footnotesHTML = renderFootnotesHTML(defs, order);

      contentEl.innerHTML = html + footnotesHTML;
      buildTOC();
      wireScrollSpy();

      // honor a #hash present on page load, once content exists
      if (location.hash) {
        const target = document.querySelector(location.hash);
        if (target) target.scrollIntoView({ block: "start" });
      }
    } catch (err) {
      contentEl.innerHTML = `
        <div class="state error">
          Could not load OSJ_DOCTRINE.md (${err.message}).<br>
          If you're viewing this file locally, serve it over HTTP
          rather than opening index.html directly — browsers block
          fetch() on the file:// protocol.
        </div>`;
      // eslint-disable-next-line no-console
      console.error("OSJ Doctrine render failed:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", render);
})();

