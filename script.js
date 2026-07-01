console.log("Script load ho rahi hai!");

// ============================================
// LIGHT/DARK MODE BUTTON – IMPROVED VERSION
// ============================================

// 1. बटन बनाएँ
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
btn.style.fontSize = "14px";
btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
btn.style.transition = "all 0.3s ease"; // ✨ होवर पर स्मूथ ट्रांजिशन

// 2. होवर इफेक्ट (CSS के बिना)
btn.addEventListener('mouseenter', function() {
    this.style.background = "#0077ff";
    this.style.transform = "scale(1.05)";
    this.style.boxShadow = "0 6px 20px rgba(0,119,255,0.4)";
});

btn.addEventListener('mouseleave', function() {
    this.style.background = "#1558d6";
    this.style.transform = "scale(1)";
    this.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
});

// 3. क्लिक करने पर लाइट मोड टॉगल + बटन का टेक्स्ट बदले
btn.onclick = function() {
    document.body.classList.toggle("light-mode");
    
    // बटन का टेक्स्ट बदलें
    if (document.body.classList.contains("light-mode")) {
        this.innerHTML = "🌙 Dark Mode";
        this.style.background = "#1a73e8"; // लाइट मोड में थोड़ा अलग कलर
    } else {
        this.innerHTML = "🌓 Light/Dark Mode";
        this.style.background = "#1558d6";
    }
};

// 4. बटन को वेबसाइट पर जोड़ें
document.body.appendChild(btn);
