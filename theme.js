// 1. Remember and persist light/dark theme preference
(function() {
    function applyTheme() {
        if (localStorage.getItem("theme") === "light" && document.body) {
            document.body.classList.add("light-mode");
        }
    }

    function initThemeObserver() {
        if (!document.body) return;
        applyTheme();
        
        const observer = new MutationObserver(function() {
            if (document.body.classList.contains("light-mode")) {
                localStorage.setItem("theme", "light");
            } else {
                localStorage.setItem("theme", "dark");
            }
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.body) {
        initThemeObserver();
    } else {
        document.addEventListener("DOMContentLoaded", initThemeObserver);
    }
})();

