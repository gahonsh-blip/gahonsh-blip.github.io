// Localization stub
const i18n = {
    locale: localStorage.getItem('locale') || 'en',

    translations: {
        en: {
            'dashboard': 'Dashboard',
            'customers': 'Customers',
            'loans': 'Loans',
            'settings': 'Settings',
            'sign_out': 'Sign Out',
            'loading': 'Loading...',
            'actions': 'Actions',
            'view_profile': 'View Profile',
            'call': 'Call',
            'send_message': 'Send Message'
        },
        hi: {
            'dashboard': 'डैशबोर्ड',
            'customers': 'ग्राहक',
            'loans': 'ऋण',
            'settings': 'सेटिंग्स',
            'sign_out': 'साइन आउट',
            'loading': 'लोड हो रहा है...',
            'actions': 'कार्रवाई',
            'view_profile': 'प्रोफ़ाइल देखें',
            'call': 'कॉल करें',
            'send_message': 'संदेश भेजें'
        }
    },

    t(key) {
        return this.translations[this.locale][key] || key;
    },

    setLocale(lang) {
        if (this.translations[lang]) {
            this.locale = lang;
            localStorage.setItem('locale', lang);
            this.updateDOM();
        }
    },

    updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
    }
};

// Initialize translations
document.addEventListener('DOMContentLoaded', () => {
    i18n.updateDOM();
});
