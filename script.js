// बटन बनाने और उसे काम में लाने का नया पूरा कोड
const btn = document.createElement("button");
btn.innerHTML = "🌓 Light/Dark Mode";
btn.style.position = "fixed";
btn.style.top = "90px";
btn.style.left = "20px";
btn.style.zIndex = "9999";
btn.style.padding = "10px 15px";
btn.style.borderRadius = "8px";
btn.style.cursor = "pointer";
btn.style.background = "#1558d6";
btn.style.color = "white";
btn.style.border = "none";
btn.style.fontWeight = "bold";
btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";

// क्लिक करने पर लाइट मोड ऑन/ऑफ करने वाला फंक्शन
btn.onclick = function() {
    document.body.classList.toggle("light-mode");
};

// बटन को वेबसाइट पर जोड़ना
document.body.appendChild(btn);
