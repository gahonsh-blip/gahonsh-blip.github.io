// ============================================
// LIGHT/DARK MODE BUTTON – ROBUST VERSION
// ============================================
(function() {
    if (document.getElementById("themeToggleBtn")) return;

    function initThemeButton() {
        if (!document.body || document.getElementById("themeToggleBtn")) return;

        const btn = document.createElement("button");
        btn.id = "themeToggleBtn";
        const isCurrentLight = document.body.classList.contains("light-mode") || localStorage.getItem("theme") === "light";
        
        if (isCurrentLight && !document.body.classList.contains("light-mode")) {
            document.body.classList.add("light-mode");
        }

        btn.innerHTML = isCurrentLight ? "🌙 Dark Mode" : "🌓 Light Mode";
        btn.style.position = "fixed";
        btn.style.top = "90px";
        btn.style.left = "20px";
        btn.style.zIndex = "9999";
        btn.style.padding = "8px 14px";
        btn.style.borderRadius = "30px";
        btn.style.cursor = "pointer";
        btn.style.background = isCurrentLight ? "#0284c7" : "#1558d6";
        btn.style.color = "white";
        btn.style.border = "1px solid rgba(255,255,255,0.2)";
        btn.style.fontWeight = "600";
        btn.style.fontSize = "13px";
        btn.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
        btn.style.transition = "all 0.25s ease";

        btn.addEventListener('mouseenter', function() {
            this.style.transform = "scale(1.05)";
            this.style.boxShadow = "0 6px 20px rgba(0,119,255,0.4)";
        });

        btn.addEventListener('mouseleave', function() {
            this.style.transform = "scale(1)";
            this.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
        });

        btn.onclick = function() {
            document.body.classList.toggle("light-mode");
            const isLight = document.body.classList.contains("light-mode");
            localStorage.setItem("theme", isLight ? "light" : "dark");
            
            if (isLight) {
                this.innerHTML = "🌙 Dark Mode";
                this.style.background = "#0284c7";
            } else {
                this.innerHTML = "🌓 Light Mode";
                this.style.background = "#1558d6";
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

