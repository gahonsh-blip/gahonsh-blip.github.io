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

