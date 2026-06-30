// 1. पेज खुलने पर लाइट मोड को याद रखना
if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
}

// 2. आपके लगाए हुए बटन के काम को सेव करना
const observer = new MutationObserver(function() {
    if (document.body.classList.contains("light-mode")) {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "dark");
    }
});

observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
