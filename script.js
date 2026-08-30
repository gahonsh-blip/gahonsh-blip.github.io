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
// SCROLL-TRIGGERED FADE-IN (INTERSECTION OBSERVER)
// Applies to .why-card, .port-card, .process-card
// ============================================
(function() {
    function initScrollAnimations() {
        const targetElements = document.querySelectorAll('.why-card, .port-card, .process-card');
        if (!targetElements.length) return;

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!('IntersectionObserver' in window) || prefersReducedMotion) {
            targetElements.forEach(function(el) {
                el.classList.add('revealed');
            });
            return;
        }

        const observerOptions = {
            root: null,
            rootMargin: '0px 0px -40px 0px',
            threshold: 0.12
        };

        const observer = new IntersectionObserver(function(entries, obs) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    obs.unobserve(entry.target);
                }
            });
        }, observerOptions);

        targetElements.forEach(function(el, index) {
            // If already in viewport on initial load, reveal with slight natural stagger
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                setTimeout(function() {
                    el.classList.add('revealed');
                }, (index % 4) * 80);
            } else {
                observer.observe(el);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollAnimations);
    } else {
        initScrollAnimations();
    }
})();

