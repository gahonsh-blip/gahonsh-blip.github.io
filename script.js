// ============================================
// LIGHT/DARK MODE BUTTON – ROBUST & ELEGANT
// ============================================
(function() {
    if (document.getElementById("themeToggleBtn")) return;

    function initThemeButton() {
        if (!document.body || document.getElementById("themeToggleBtn")) return;

        const btn = document.createElement("button");
        btn.id = "themeToggleBtn";
        btn.setAttribute("aria-label", "Toggle color theme");
        const isCurrentLight = document.body.classList.contains("light-mode") || localStorage.getItem("theme") === "light";
        
        if (isCurrentLight && !document.body.classList.contains("light-mode")) {
            document.body.classList.add("light-mode");
        }

        btn.innerHTML = isCurrentLight ? '<i class="fa-solid fa-moon"></i> Dark' : '<i class="fa-solid fa-sun"></i> Light';
        btn.style.position = "fixed";
        btn.style.bottom = "35px";
        btn.style.left = "90px";
        btn.style.zIndex = "9998";
        btn.style.padding = "10px 18px";
        btn.style.borderRadius = "30px";
        btn.style.cursor = "pointer";
        btn.style.background = isCurrentLight ? "#0284c7" : "#0f172a";
        btn.style.color = "#ffffff";
        btn.style.border = "1px solid rgba(255, 255, 255, 0.15)";
        btn.style.fontWeight = "600";
        btn.style.fontSize = "13px";
        btn.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)";
        btn.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.gap = "8px";
        btn.style.fontFamily = "'Plus Jakarta Sans', system-ui, sans-serif";

        btn.addEventListener('mouseenter', function() {
            this.style.transform = "translateY(-3px) scale(1.04)";
            this.style.boxShadow = "0 12px 28px rgba(0, 119, 255, 0.4)";
        });

        btn.addEventListener('mouseleave', function() {
            this.style.transform = "translateY(0) scale(1)";
            this.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)";
        });

        btn.onclick = function() {
            document.body.classList.toggle("light-mode");
            const isLight = document.body.classList.contains("light-mode");
            localStorage.setItem("theme", isLight ? "light" : "dark");
            
            if (isLight) {
                this.innerHTML = '<i class="fa-solid fa-moon"></i> Dark';
                this.style.background = "#0284c7";
            } else {
                this.innerHTML = '<i class="fa-solid fa-sun"></i> Light';
                this.style.background = "#0f172a";
            }
        };

        document.body.appendChild(btn);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThemeButton);
    } else {
        initThemeButton();
    }
})();

// ============================================
// SOFT MOTION ENGINE
// Progressive enhancement. html.gs-anim is what enables the entrance
// animations and the FAQ accordion styles in theme.css, so it is set
// unconditionally: if this script never runs, nothing is pre-hidden and
// the site renders exactly as it did before.
// ============================================
(function() {
    document.documentElement.classList.add('gs-anim');

    const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (REDUCED || !('IntersectionObserver' in window)) return;

    function initMotion() {
        // Elements that opt in via data-gs-reveal, plus the legacy card
        // classes that already relied on a .revealed class.
        const legacy = document.querySelectorAll('.why-card, .port-card, .process-card');
        const opts = document.querySelectorAll('[data-gs-reveal]');
        // Skip targets nested inside another target, otherwise the inner
        // element would animate separately and be hidden by the outer one.
        const targets = Array.from(new Set([...legacy, ...opts]))
            .filter(function(el) {
                return !el.parentElement || !el.parentElement.closest('[data-gs-reveal]');
            });
        if (!targets.length) return;

        const observer = new IntersectionObserver(function(entries, obs) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                // Remove the hiding class as we reveal. Leaving it in place
                // would re-apply opacity:0 once the animation finishes, since
                // the keyframes do not fill forwards.
                entry.target.classList.remove('gs-hide');
                entry.target.classList.add('gs-visible');
                entry.target.classList.add('revealed'); // legacy hook
                obs.unobserve(entry.target);
            });
        }, { root: null, rootMargin: '0px 0px -40px 0px', threshold: 0.12 });

        targets.forEach(function(el) {
            const rect = el.getBoundingClientRect();
            // Only elements that start below the fold are hidden, and only
            // after this runs. Anything already on screen stays visible, so
            // the first paint is never wrong and nothing can flash.
            if (rect.top < window.innerHeight) return;
            el.classList.add('gs-hide');
            observer.observe(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMotion);
    } else {
        initMotion();
    }
})();

// ============================================
// FAQ ACCORDION (smooth max-height animation)
// The pages used display:none/block, which cannot animate. This replaces
// that with the .gs-open class plus a measured pixel max-height. The inline
// height is deliberately kept after opening: clearing it would fall back to
// the stylesheet's max-height:0 and collapse the panel again.
// ============================================
(function() {
    function initFaq() {
        const questions = document.querySelectorAll('.faq-question');
        if (!questions.length) return;

        function measureOpenHeight(panel) {
            // Measure in the fully-open state with transitions suppressed.
            // box-sizing is border-box, so max-height includes padding: if we
            // measure while the 20px bottom padding is still animating in,
            // the value is too small and the text gets clipped.
            const prev = panel.style.transition;
            panel.style.transition = 'none';
            panel.classList.add('gs-open');
            const h = panel.scrollHeight;
            void panel.offsetHeight;
            panel.style.transition = prev;
            return h;
        }

        function openPanel(panel) {
            panel.style.maxHeight = measureOpenHeight(panel) + 'px';
        }

        function closePanel(panel) {
            // Pin the current height first, then animate down to 0.
            panel.style.maxHeight = panel.scrollHeight + 'px';
            void panel.offsetHeight; // force reflow so the change animates
            panel.classList.remove('gs-open');
            panel.style.maxHeight = '0px';
        }

        questions.forEach(function(q) {
            const answer = q.nextElementSibling;
            if (answer && answer.classList.contains('faq-answer')) {
                answer.style.display = ''; // drop leftover inline display
            }

            q.addEventListener('click', function() {
                const panel = q.nextElementSibling;
                const icon = q.querySelector('i');
                if (!panel || !panel.classList.contains('faq-answer')) return;

                if (panel.classList.contains('gs-open')) {
                    closePanel(panel);
                    if (icon) icon.className = 'fa-solid fa-plus';
                } else {
                    openPanel(panel);
                    if (icon) icon.className = 'fa-solid fa-minus';
                }
            });
        });

        // Re-measure open panels so longer/shorter content still fits.
        window.addEventListener('resize', function() {
            document.querySelectorAll('.faq-answer.gs-open').forEach(function(panel) {
                panel.style.maxHeight = measureOpenHeight(panel) + 'px';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFaq);
    } else {
        initFaq();
    }
})();

