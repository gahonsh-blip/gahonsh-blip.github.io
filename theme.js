// बटन बनाना
const btn = document.createElement("button");
btn.innerHTML = "🌓 Light/Dark Mode";
btn.style.position = "fixed";
btn.style.top = "100px";
btn.style.left = "20px";
btn.style.zIndex = "999999";
btn.style.padding = "10px 15px";
btn.style.background = "#1558d6";
btn.style.color = "white";
btn.style.border = "none";
btn.style.borderRadius = "8px";
btn.style.fontWeight = "bold";
btn.style.cursor = "pointer";
btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";

document.body.appendChild(btn);

// चेक करना कि पहले से लाइट मोड ऑन तो नहीं है
if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
}

// बटन दबाने पर मोड बदलना और याद रखना
btn.onclick = function () {
    document.body.classList.toggle("light-mode");
    
    if (document.body.classList.contains("light-mode")) {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "dark");
    }
};
