/* =========================================================================
   GAHONSH FREELANCING — website assistant chat (bilingual: हिंदी + English)
   Self-contained. No external API, no keys, no per-visitor cost.
   Answers come from a curated knowledge base of the site's real facts.
   Lead capture writes to Supabase contact_messages (owner gets an email).
   ========================================================================= */
(function () {
    'use strict';

    if (window.__gahonshChatLoaded) return;
    window.__gahonshChatLoaded = true;

    /* ---------------------------------------------------------------- config */
    var BASE = 'https://gahonsh-blip.github.io/';
    var L = {
        home: BASE,
        services: BASE + 'services.html',
        pricing: BASE + 'pricing.html',
        portfolio: BASE + 'portfolio.html',
        contact: BASE + 'contact.html',
        findTalent: BASE + 'find-talent.html',
        postJob: BASE + 'post-job.html',
        jobs: BASE + 'jobs.html',
        portal: BASE + 'marketplace-dashboard.html',
        about: BASE + 'about.html',
        whatsapp: 'https://wa.me/918825183628',
        email: 'mailto:gahonsh@gmail.com',
        bundle: BASE + 'assets/projects/project-bundle.zip',
        xlFinance: BASE + 'assets/projects/finance-dashboard-sample.xlsx',
        xlLoan: BASE + 'assets/projects/loan-calculator-sample.xlsx',
        xlInventory: BASE + 'assets/projects/inventory-tracker-sample.xlsx',
        xlAttendance: BASE + 'assets/projects/attendance-manager-sample.xlsx',
        pdfProfile: BASE + 'assets/projects/company-profile-sample.pdf',
        pdfCatalog: BASE + 'assets/projects/corporate-catalog-sample.pdf',
        pdfBrochure: BASE + 'assets/projects/service-brochure-sample.pdf',
        pdfResume: BASE + 'assets/projects/resume-design-sample.pdf',
        docx: BASE + 'assets/projects/sample-document.docx',
        pptx: BASE + 'assets/projects/sample-presentation.pptx'
    };

    function a(url, label) {
        return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
    }

    /* ------------------------------------------------------------- knowledge */
    // Every keyword is matched case-insensitively. Devanagari and Hinglish both
    // live in the same list, so one intent serves both languages.
    var KB = [
        {
            id: 'greet',
            kw: ['hi', 'hello', 'hey', 'namaste', 'नमस्ते', 'नमस्कार', 'hlo', 'salaam', 'good morning', 'good evening', 'start'],
            chips: ['services', 'pricing', 'portfolio', 'human'],
            en: 'Hi! I am the Gahonsh assistant. I can explain our services, show real sample files, share prices and connect you with the team.<br><br>What are you looking for: *Excel automation, PDF design, presentations, a website, or AI workflows?*',
            hi: 'नमस्ते! मैं GAHONSH का assistant हूँ. मैं आपको सेवाएँ, असली sample files, कीमतें बता सकता हूँ और team से जोड़ सकता हूँ.<br><br>आपको क्या चाहिए: *Excel automation, PDF design, presentation, website या AI workflow?*'
        },
        {
            id: 'services',
            kw: ['service', 'services', 'what do you do', 'what you do', 'offer', 'kya karte', 'kya kaam', 'kaam kya', 'क्या काम', 'क्या करते', 'सेवा', 'सर्विस', 'list'],
            chips: ['excel', 'pdf', 'web', 'pricing'],
            en: 'We handle six kinds of work:<br><br>1. *Excel automation*: dashboards, macros, formulas, trackers (from $25)<br>2. *PDF design*: company profiles, catalogues, brochures (from $25)<br>3. *Presentations*: investor and sales decks (from $25)<br>4. *Websites*: landing pages, business sites, updates (from $25)<br>5. *AI workflows*: prompt systems, content automation (from $25)<br>6. *Branding*: logo, typography, colour system (from $25)<br><br>Full detail: ' + a(L.services, 'services page'),
            hi: 'हम छह तरह का काम करते हैं:<br><br>1. *Excel automation*: dashboard, macro, formula, tracker ($25 से)<br>2. *PDF design*: company profile, catalogue, brochure ($25 से)<br>3. *Presentation*: investor और sales deck ($25 से)<br>4. *Website*: landing page, business site, updates ($25 से)<br>5. *AI workflow*: prompt system, content automation ($25 से)<br>6. *Branding*: logo, typography, colour system ($25 से)<br><br>पूरी जानकारी: ' + a(L.services, 'services page')
        },
        {
            id: 'excel',
            b_en: 'Excel: dashboards, macros, formulas and trackers, from $25.',
            b_hi: 'Excel: dashboard, macro, formula और tracker, $25 से.',
            kw: ['excel', 'spreadsheet', 'dashboard', 'macro', 'vba', 'formula', 'tracker', 'एक्सेल', 'मैक्रो', 'डैशबोर्ड', 'sheet', 'google sheet', 'data entry'],
            chips: ['excelSamples', 'pricing', 'timeline', 'quote'],
            en: 'Excel is our strongest area. We build:<br><br>• Automated dashboards with KPI cards and native charts<br>• Macro and VBA workflows that remove manual copy-paste<br>• Formula repair on messy existing sheets<br>• Stock, attendance, loan and finance trackers<br><br>Sample with 1,000 rows, live formulas and 5 charts: ' + a(L.xlFinance, 'Finance Dashboard (xlsx)') + '<br><br>From *$25* per sheet. Tell me your sheet and I will suggest the right build.',
            hi: 'Excel हमारा सबसे मज़बूत काम है. हम बनाते हैं:<br><br>• KPI cards और charts वाला automated dashboard<br>• Macro/VBA workflow, जिससे manual copy-paste खत्म<br>• पुरानी गड़बड़ sheet के formula की मरम्मत<br>• Stock, attendance, loan और finance tracker<br><br>1,000 rows, live formula और 5 charts वाला sample: ' + a(L.xlFinance, 'Finance Dashboard (xlsx)') + '<br><br>एक sheet *$25* से. अपनी sheet बताइए, सही design सुझा दूँगा.'
        },
        {
            id: 'pdf',
            b_en: 'PDF: profiles, catalogues and brochures, from $25, usually 2-4 days.',
            b_hi: 'PDF: profile, catalogue और brochure, $25 से, आम तौर पर 2-4 दिन.',
            kw: ['pdf', 'brochure', 'catalogue', 'catalog', 'profile', 'document design', 'पीडीएफ', 'ब्रोशर', 'कैटलॉग', 'print', 'layout'],
            chips: ['pdfSamples', 'pricing', 'timeline', 'quote'],
            en: 'We design print-ready, text-searchable PDFs: company profiles, product catalogues, service brochures and resume layouts.<br><br>Live samples:<br>• ' + a(L.pdfProfile, 'Company Profile (3 pages)') + '<br>• ' + a(L.pdfCatalog, 'Product Catalogue (price tables + chart)') + '<br>• ' + a(L.pdfBrochure, 'Service Brochure (2 pages)') + '<br>• ' + a(L.pdfResume, 'Resume Layout') + '<br><br>From *$25*, usually 2-4 days.',
            hi: 'हम print-ready और text-searchable PDF बनाते हैं: company profile, product catalogue, service brochure और resume layout.<br><br>असली sample:<br>• ' + a(L.pdfProfile, 'Company Profile (3 pages)') + '<br>• ' + a(L.pdfCatalog, 'Product Catalogue (price table + chart)') + '<br>• ' + a(L.pdfBrochure, 'Service Brochure (2 pages)') + '<br>• ' + a(L.pdfResume, 'Resume Layout') + '<br><br>*$25* से, आम तौर पर 2-4 दिन.'
        },
        {
            id: 'ppt',
            b_en: 'Decks: investor and sales slides, from $25, 3-5 days.',
            b_hi: 'Deck: investor और sales slide, $25 से, 3-5 दिन.',
            kw: ['ppt', 'presentation', 'deck', 'slide', 'powerpoint', 'pitch', 'प्रेजेंटेशन', 'स्लाइड', 'deck banao'],
            chips: ['deckSample', 'pricing', 'quote'],
            en: 'Investor pitch decks, sales decks and corporate slide sets: clean grid, your brand colours, editable charts.<br><br>8-slide editable sample: ' + a(L.pptx, 'Proposal Deck (pptx)') + '<br><br>From *$25*. Send your content and I will confirm the slide count and price.',
            hi: 'Investor pitch deck, sales deck और corporate slides: साफ grid, आपके brand colour, editable charts.<br><br>8-slide editable sample: ' + a(L.pptx, 'Proposal Deck (pptx)') + '<br><br>*$25* से. अपना content भेजिए, slide count और कीमत बता दूँगा.'
        },
        {
            id: 'web',
            b_en: 'Websites: landing page from $69, full application from $249.',
            b_hi: 'Website: landing page $69 से, पूरा application $249 से.',
            kw: ['website', 'web', 'landing', 'site', 'web development', 'frontend', 'react', 'node', 'api', 'वेबसाइट', 'वेब', 'html', 'shopify', 'wordpress', 'app'],
            chips: ['portfolio', 'pricing', 'quote', 'timeline'],
            en: 'Web work we do:<br><br>• Landing pages and business websites (mobile-first)<br>• Node.js and Express APIs, JWT auth, admin panels<br>• Database design (MySQL, PostgreSQL, MongoDB)<br>• Fixes and monthly content updates on an existing site<br><br>Live examples: ' + a(L.portfolio, 'portfolio') + '<br><br>Starter site from *$69*, full application from *$249*. What is the scope?',
            hi: 'Website के काम:<br><br>• Landing page और business website (mobile-first)<br>• Node.js और Express API, JWT auth, admin panel<br>• Database design (MySQL, PostgreSQL, MongoDB)<br>• पुरानी site की मरम्मत और monthly update<br><br>Live example: ' + a(L.portfolio, 'portfolio') + '<br><br>Starter site *$69* से, पूरा application *$249* से. आपका scope क्या है?'
        },
        {
            id: 'ai',
            b_en: 'AI: prompt systems and automation workflows, from $25.',
            b_hi: 'AI: prompt system और automation workflow, $25 से.',
            kw: ['ai', 'automation', 'chatbot', 'gpt', 'prompt', 'एआई', 'ऑटोमेशन', 'workflow', 'zapier', 'script'],
            chips: ['services', 'pricing', 'quote'],
            en: 'AI and automation work includes:<br><br>• Prompt systems and content workflows that cut drafting time<br>• Scripts that move data between sheets, mail and databases<br>• Reply engines that sort inbox mail into categories<br><br>From *$25* for a small workflow. Describe the repetitive task and I will say what is realistic.',
            hi: 'AI और automation के काम:<br><br>• Prompt system और content workflow, जिससे drafting time घटे<br>• Sheet, mail और database के बीच data भेजने वाले script<br>• Inbox mail को category में बाँटने वाला reply engine<br><br>छोटे workflow के लिए *$25* से. जो काम बार-बार करना पड़ता है वो बताइए, मैं बता दूँगा कि क्या मुमकिन है.'
        },
        {
            id: 'branding',
            b_en: 'Branding: logo plus identity pack, from $25.',
            b_hi: 'Branding: logo और identity pack, $25 से.',
            kw: ['logo', 'branding', 'brand', 'colour', 'color', 'identity', 'लोगो', 'ब्रांडिंग'],
            chips: ['pricing', 'portfolio', 'quote'],
            en: 'Branding packs give you a vector logo, typography rules, a colour palette and consistent assets for print and web.<br><br>From *$25*. See the layouts in our ' + a(L.portfolio, 'portfolio') + '.',
            hi: 'Branding pack में vector logo, typography rule, colour palette और print/web के लिए एक जैसे assets मिलते हैं.<br><br>*$25* से. Layout देखिए ' + a(L.portfolio, 'portfolio') + ' में.'
        },
        {
            id: 'pricing',
            b_en: 'Price: one service from $25, Starter from $69, Professional from $249.',
            b_hi: 'कीमत: एक service $25 से, Starter $69 से, Professional $249 से.',
            kw: ['price', 'pricing', 'cost', 'how much', 'rate', 'budget', 'charge', 'kitna', 'kitne', 'kimat', 'कीमत', 'कितना', 'कितने', 'पैसा', 'paisa', 'fees', 'quote price'],
            chips: ['starter', 'professional', 'services', 'quote'],
            en: 'Prices are fixed and quoted before work starts:<br><br>• *Starter*: from $69 (PDF formatting, data entry, standard slides, email support)<br>• *Professional*: from $249 (Excel macro dashboards, interactive PDFs, pitch decks, web updates, priority support)<br>• *Business*: custom quote (branding identity, web architecture, AI assistants, full automation)<br>• *Single service cards*: from $25<br><br>Full matrix: ' + a(L.pricing, 'pricing page') + '<br><br>No hourly surprises, no hidden fees.',
            hi: 'कीमत पहले से तय होती है, काम शुरू होने से पहले:<br><br>• *Starter*: $69 से (PDF formatting, data entry, standard slides, email support)<br>• *Professional*: $249 से (Excel macro dashboard, interactive PDF, pitch deck, web update, priority support)<br>• *Business*: custom quote (branding, web architecture, AI assistant, पूरा automation)<br>• *अलग service card*: $25 से<br><br>पूरा matrix: ' + a(L.pricing, 'pricing page') + '<br><br>कोई hourly surprise नहीं, कोई छिपी फीस नहीं.'
        },
        {
            id: 'starter',
            kw: ['starter', 'basic plan', 'small work', 'chhota kaam', 'स्टार्टर'],
            en: 'Starter, from *$69*: clean PDF formatting, basic admin data entry, standard presentation layouts and standard email support. Good for a single document or a small cleanup job.<br><br>Details: ' + a(L.pricing, 'pricing') + ' &middot; start here: ' + a(L.contact, 'send requirements'),
            hi: 'Starter, *$69* से: साफ PDF formatting, basic data entry, standard presentation layout और standard email support. एक document या छोटे cleanup के लिए ठीक है.<br><br>जानकारी: ' + a(L.pricing, 'pricing') + ' &middot; शुरू करें: ' + a(L.contact, 'requirement भेजें')
        },
        {
            id: 'professional',
            kw: ['professional plan', 'pro plan', 'advanced', 'प्रोफेशनल'],
            en: 'Professional, from *$249*: advanced Excel macro dashboards, high-end interactive PDFs, premium investor decks, continuous front-end updates and priority support.<br><br>Details: ' + a(L.pricing, 'pricing') + ' &middot; ask for a milestone quote: ' + a(L.contact, 'contact'),
            hi: 'Professional, *$249* से: advanced Excel macro dashboard, high-end interactive PDF, premium investor deck, लगातार front-end update और priority support.<br><br>जानकारी: ' + a(L.pricing, 'pricing') + ' &middot; milestone quote: ' + a(L.contact, 'contact')
        },
        {
            id: 'portfolio',
            kw: ['portfolio', 'sample', 'samples', 'example', 'demo', 'work', 'download', 'file', 'पोर्टफोलियो', 'नमूना', 'डाउनलोड', 'dekho', 'dikhao', 'previous work'],
            chips: ['excelSamples', 'bundle', 'pricing', 'quote'],
            en: 'Every sample is a real working file, not a screenshot. Browse all of it: ' + a(L.portfolio, 'portfolio page') + '<br><br>One archive with all ten files: ' + a(L.bundle, 'download bundle (zip)') + '<br><br>Inside: 4 Excel workbooks (1,000 rows + dashboards), 4 print-ready PDFs, a Word proposal and an 8-slide deck.',
            hi: 'हर sample असली चलने वाली file है, सिर्फ screenshot नहीं. सब देखिए: ' + a(L.portfolio, 'portfolio page') + '<br><br>दसों file एक archive में: ' + a(L.bundle, 'bundle download (zip)') + '<br><br>अंदर: 4 Excel workbook (1,000 rows + dashboard), 4 print-ready PDF, एक Word proposal और 8-slide deck.'
        },
        {
            id: 'excelSamples',
            kw: ['excel sample', 'dashboard sample', 'finance dashboard', 'loan calculator', 'inventory', 'attendance', 'workbook'],
            en: 'Four working workbooks, each with about 1,000 rows, a KPI dashboard and native charts:<br><br>• ' + a(L.xlFinance, 'Finance Dashboard') + ' (24 months, 5 charts)<br>• ' + a(L.xlLoan, 'Loan and EMI Calculator') + ' (360-month schedule + 1,000 scenarios)<br>• ' + a(L.xlInventory, 'Inventory Tracker') + ' (1,000 SKUs, reorder alerts)<br>• ' + a(L.xlAttendance, 'Attendance Manager') + ' (40 people, 3 summary views)<br><br>Open them and replace the sample data with yours.',
            hi: 'चार चलने वाले workbook, हर एक में लगभग 1,000 rows, KPI dashboard और charts:<br><br>• ' + a(L.xlFinance, 'Finance Dashboard') + ' (24 महीने, 5 charts)<br>• ' + a(L.xlLoan, 'Loan और EMI Calculator') + ' (360-महीने schedule + 1,000 scenario)<br>• ' + a(L.xlInventory, 'Inventory Tracker') + ' (1,000 SKU, reorder alert)<br>• ' + a(L.xlAttendance, 'Attendance Manager') + ' (40 लोग, 3 summary view)<br><br>खोलिए और sample data की जगह अपना data डालिए.'
        },
        {
            id: 'pdfSamples',
            kw: ['pdf sample', 'profile sample', 'catalogue sample', 'brochure sample', 'resume sample'],
            en: 'Print-ready PDF samples:<br><br>• ' + a(L.pdfProfile, 'Company Profile') + '<br>• ' + a(L.pdfCatalog, 'Product Catalogue') + '<br>• ' + a(L.pdfBrochure, 'Service Brochure') + '<br>• ' + a(L.pdfResume, 'Resume Layout') + '<br><br>All A4, text-searchable, with real tables and charts.',
            hi: 'Print-ready PDF sample:<br><br>• ' + a(L.pdfProfile, 'Company Profile') + '<br>• ' + a(L.pdfCatalog, 'Product Catalogue') + '<br>• ' + a(L.pdfBrochure, 'Service Brochure') + '<br>• ' + a(L.pdfResume, 'Resume Layout') + '<br><br>सब A4, text-searchable, असली table और chart के साथ.'
        },
        {
            id: 'deckSample',
            kw: ['deck sample', 'ppt sample', 'presentation sample', 'docx', 'word sample', 'proposal sample'],
            en: 'Editable office samples:<br><br>• ' + a(L.pptx, 'Proposal Deck') + ' (8 slides, 2 editable charts)<br>• ' + a(L.docx, 'Project Proposal') + ' (Word, pricing table + embedded chart)<br><br>Both use the same clean layout you would get for your own project.',
            hi: 'Editable office sample:<br><br>• ' + a(L.pptx, 'Proposal Deck') + ' (8 slide, 2 editable chart)<br>• ' + a(L.docx, 'Project Proposal') + ' (Word, pricing table + chart)<br><br>दोनों उसी साफ layout में हैं जो आपके project के लिए मिलेगा.'
        },
        {
            id: 'bundle',
            kw: ['bundle', 'zip', 'all files', 'sab file', 'सारी फाइल', 'everything'],
            en: 'All ten files in one archive: ' + a(L.bundle, 'download bundle (zip)') + '<br><br>Four Excel workbooks with 1,000 rows each, four PDFs, a Word proposal and an 8-slide deck, plus a README.',
            hi: 'दसों file एक archive में: ' + a(L.bundle, 'bundle download (zip)') + '<br><br>चार Excel workbook (हर एक 1,000 rows), चार PDF, एक Word proposal, 8-slide deck और README.'
        },
        {
            id: 'timeline',
            b_en: 'Timing: PDF 2-4 days, Excel dashboard 3-6 days, landing page 5-7 days, full app 2-3 weeks.',
            b_hi: 'समय: PDF 2-4 दिन, Excel dashboard 3-6 दिन, landing page 5-7 दिन, पूरा app 2-3 हफ्ते.',
            kw: ['how long', 'timeline', 'delivery', 'time', 'days', 'deadline', 'kitne din', 'kitna time', 'कितना समय', 'कितने दिन', 'कब', 'jaldi', 'urgent', 'fast'],
            chips: ['pricing', 'process', 'quote'],
            en: 'Typical delivery:<br><br>• PDF layout or small fix: *2-4 days*<br>• Excel dashboard or tracker: *3-6 days*<br>• Deck: *3-5 days*<br>• Landing page: *5-7 days*<br>• Full web application: *2-3 weeks*<br><br>Urgent work is possible when the scope is small. Share your date and I will confirm what fits.',
            hi: 'आम delivery:<br><br>• PDF layout या छोटा fix: *2-4 दिन*<br>• Excel dashboard या tracker: *3-6 दिन*<br>• Deck: *3-5 दिन*<br>• Landing page: *5-7 दिन*<br>• पूरा web application: *2-3 हफ्ते*<br><br>जल्दी वाला काम तभी मुमकिन है जब scope छोटा हो. अपनी तारीख बताइए, मैं बता दूँगा क्या मुमकिन है.'
        },
        {
            id: 'process',
            b_en: 'Process: requirement, fixed quote, build, delivery with 7-day support.',
            b_hi: 'प्रक्रिया: requirement, पक्की कीमत, निर्माण, delivery और 7 दिन support.',
            kw: ['process', 'how it works', 'how do you work', 'steps', 'kaise kaam', 'कैसे काम', 'प्रक्रिया', 'workflow steps'],
            en: 'Four steps:<br><br>1. *Consultation*: you share the requirement, we confirm scope<br>2. *Planning*: fixed quote, file structure and milestones<br>3. *Build*: we develop and send a draft for review<br>4. *Delivery*: final files, walkthrough and 7-day free bug support<br><br>See it on ' + a(L.about, 'about page') + '. Start with ' + a(L.contact, 'your requirement') + '.',
            hi: 'चार step:<br><br>1. *Consultation*: आप requirement बताइए, हम scope confirm करते हैं<br>2. *Planning*: पक्की कीमत, file structure और milestone<br>3. *Build*: हम बनाकर draft भेजते हैं<br>4. *Delivery*: final file, walkthrough और 7 दिन मुफ्त bug support<br><br>देखिए ' + a(L.about, 'about page') + '. शुरुआत: ' + a(L.contact, 'अपनी requirement') + '.'
        },
        {
            id: 'revision',
            kw: ['revision', 'changes', 'modify', 'edit after', 'रिवीजन', 'बदलाव', 'sudhar'],
            en: 'Every package includes revision rounds, fixed in writing before we start. Small corrections inside the agreed scope are free; a new scope is a new milestone and quoted separately.',
            hi: 'हर package में revision round शामिल है, जो काम शुरू होने से पहले लिखित में तय होता है. तय scope के अंदर छोटा सुधार मुफ्त; नया scope नया milestone है, उसकी कीमत अलग बताई जाती है.'
        },
        {
            id: 'payment',
            b_en: 'Payment is milestone based: a deposit to start, the balance on delivery.',
            b_hi: 'भुगतान milestone पर: शुरू में deposit, delivery पर बाकी.',
            kw: ['payment', 'pay', 'advance', 'deposit', 'upi', 'bank', 'invoice', 'escrow', 'milestone', 'पेमेंट', 'पैसे कैसे', 'भुगतान', 'card'],
            en: 'Payment works on milestones: a deposit to start, the balance on delivery. Bank transfer, UPI and international transfer are all accepted, and every invoice is documented. Nothing is charged before the quote is confirmed in writing.',
            hi: 'भुगतान milestone पर: शुरू में deposit, delivery पर बाकी. Bank transfer, UPI और international transfer सब चलता है, और हर invoice का record रहता है. Quote लिखित में पक्का होने से पहले कुछ नहीं लिया जाता.'
        },
        {
            id: 'remote',
            kw: ['international', 'abroad', 'remote', 'timezone', 'outside india', 'usa', 'uk', 'canada', 'australia', 'dubai', 'दूसरे देश', 'विदेश', 'time zone'],
            en: 'Yes. All work is delivered remotely for clients worldwide (USA, UK, Canada, UAE, Australia, Europe, India). Communication is by email and WhatsApp, and meetings can be scheduled in your time zone. Files are shared as downloadable links.',
            hi: 'हाँ. सारा काम दुनिया भर के client के लिए remotely होता है (USA, UK, Canada, UAE, Australia, Europe, India). बातचीत email और WhatsApp पर, और meeting आपके time zone में तय हो सकती है. File download link से मिलती है.'
        },
        {
            id: 'hireTalent',
            kw: ['hire', 'hire talent', 'freelancer chahiye', 'find talent', 'find freelancer', 'वर्कर चाहिए', 'फ्रीलांसर', 'staff', 'team'],
            en: 'Need a specialist? Browse verified profiles on ' + a(L.findTalent, 'Find Talent') + ' and message them directly. If you would rather describe the job once, post it free on ' + a(L.postJob, 'Post a Job') + ' and let freelancers apply.<br><br>Posting a project is free: you only pay the freelancer you choose.',
            hi: 'Specialist चाहिए? ' + a(L.findTalent, 'Find Talent') + ' पर verified profile देखिए और सीधे message कीजिए. या एक बार job लिखकर ' + a(L.postJob, 'Post a Job') + ' पर मुफ्त डाल दीजिए, freelancer खुद apply करेंगे.<br><br>Project डालना मुफ्त है: पैसा सिर्फ उस freelancer को जो आप चुनें.'
        },
        {
            id: 'findWork',
            kw: ['work chahiye', 'kaam chahiye', 'kam chahiye', 'job chahiye', 'freelance job', 'as freelancer', 'i am a freelancer', 'find work', 'काम चाहिए', 'नौकरी', 'worker signup', 'register as', 'apply karna'],
            en: 'Want work? Create a free worker account at ' + a(L.portal, 'the portal') + ', complete your profile with skills and a portfolio link, then apply to open projects on ' + a(L.jobs, 'Find Work') + '.<br><br>Clients post fixed-price projects, so you know the budget before you apply. There is no fee to join.',
            hi: 'काम चाहिए? ' + a(L.portal, 'portal') + ' पर मुफ्त worker account बनाइए, profile में skill और portfolio link भरिए, फिर ' + a(L.jobs, 'Find Work') + ' पर open project में apply कीजिए.<br><br>Client fixed-price project डालते हैं, यानी apply से पहले budget पता रहता है. जुड़ने का कोई शुल्क नहीं.'
        },
        {
            id: 'human',
            kw: ['human', 'person', 'talk to someone', 'call', 'phone', 'whatsapp', 'contact', 'email', 'support', 'baat karni', 'बात करनी', 'संपर्क', 'मदद', 'help', 'agent'],
            chips: ['contactPage', 'quote', 'pricing'],
            en: 'Happy to connect you with the team:<br><br>• WhatsApp: ' + a(L.whatsapp, '+91 88251 83628') + '<br>• Email: ' + a(L.email, 'gahonsh@gmail.com') + '<br>• Contact form: ' + a(L.contact, 'contact page') + '<br><br>Normal reply time is 1-3 hours during the day (IST). Tell me your project too and I can prepare the details for them.',
            hi: 'Team से जोड़ देता हूँ:<br><br>• WhatsApp: ' + a(L.whatsapp, '+91 88251 83628') + '<br>• Email: ' + a(L.email, 'gahonsh@gmail.com') + '<br>• Contact form: ' + a(L.contact, 'contact page') + '<br><br>दिन में (IST) जवाब आम तौर पर 1-3 घंटे में आता है. अपना project भी बता दीजिए, मैं details तैयार कर दूँगा.'
        },
        {
            id: 'contactPage',
            kw: ['contact page', 'form', 'enquiry', 'inquiry', 'message bhej', 'फॉर्म'],
            en: 'The contact form is here: ' + a(L.contact, 'contact page') + '. Fill name, email, service and budget, and it lands in our dashboard with an instant email alert. You can also write to ' + a(L.email, 'gahonsh@gmail.com') + '.',
            hi: 'Contact form यहाँ है: ' + a(L.contact, 'contact page') + '. नाम, email, service और budget भरिए, वो हमारे dashboard में पहुँचता है और तुरंत email alert आता है. ' + a(L.email, 'gahonsh@gmail.com') + ' पर भी लिख सकते हैं.'
        },
        {
            id: 'quote',
            kw: ['quote', 'quotation', 'proposal', 'get started', 'start project', 'hire you', 'kaam karwana', 'शुरू करना', 'क्वोट', 'कीमत बताओ', 'estimate', 'requirement'],
            chips: ['pricing', 'human'],
            en: 'Let us prepare a quote. I need three things: your name, your email, and a line about the work.<br><br>Type your *name* to start.',
            hi: 'चलिए quote तैयार करते हैं. तीन चीज़ें चाहिए: आपका नाम, email, और काम के बारे में एक लाइन.<br><br>शुरू करने के लिए अपना *नाम* लिखिए.'
        },
        {
            id: 'tech',
            kw: ['tech stack', 'technology', 'which technology', 'stack', 'framework', 'python', 'php', 'laravel', 'flutter', 'mysql', 'mongodb', 'postgres', 'java'],
            en: 'Stack we work in: JavaScript and TypeScript, Node.js with Express, React, PHP and Laravel, Python for automation, MySQL, PostgreSQL and MongoDB, plus Flutter for Android and iOS. Excel and VBA for spreadsheet work.',
            hi: 'हमारा stack: JavaScript और TypeScript, Node.js (Express), React, PHP और Laravel, automation के लिए Python, MySQL, PostgreSQL और MongoDB, और Android/iOS के लिए Flutter. Spreadsheet के लिए Excel और VBA.'
        },
        {
            id: 'guarantee',
            kw: ['guarantee', 'warranty', 'support after', 'bug', 'refund', 'money back', 'गारंटी', 'रिफंड', 'trust', 'safe'],
            en: 'What you get in writing:<br><br>• Fixed price agreed before work starts<br>• 7 days of free bug support after delivery<br>• Revisions inside the agreed scope at no cost<br><br>If something is broken after delivery, it is fixed free. A refund is discussed only if the agreed deliverable is not provided at all, and it is settled case by case.',
            hi: 'लिखित में ये मिलता है:<br><br>• काम शुरू होने से पहले पक्की कीमत<br>• Delivery के बाद 7 दिन मुफ्त bug support<br>• तय scope के अंदर revision मुफ्त<br><br>Delivery के बाद कुछ टूटा हो तो मुफ्त ठीक होगा. Refund सिर्फ तब बात होती है जब तय किया हुआ deliverable दिया ही न जाए, और वो case by case तय होता है.'
        },
        {
            id: 'security',
            kw: ['nda', 'confidential', 'data safety', 'privacy', 'secure', 'गोपनीय', 'सुरक्षा', 'secret'],
            en: 'Your data stays private: files are used only for your project, client data is never shown in samples, and we can sign an NDA before you share anything sensitive. See the ' + a(BASE + 'privacy-policy.html', 'privacy policy') + '.',
            hi: 'आपका data निजी रहता है: file सिर्फ आपके project के लिए इस्तेमाल होती है, client data कभी sample में नहीं दिखता, और संवेदनशील चीज़ भेजने से पहले NDA साइन कर सकते हैं. देखिए ' + a(BASE + 'privacy-policy.html', 'privacy policy') + '.'
        },
        {
            id: 'about',
            kw: ['who are you', 'about', 'company', 'gahonsh', 'where are you', 'location', 'address', 'कौन हो', 'कहाँ', 'पता', 'established'],
            en: 'GAHONSH FREELANCING is a digital solutions studio in Bundu, Ranchi, Jharkhand, India, working with clients worldwide. We do Excel automation, PDF and presentation design, websites and AI workflows. More: ' + a(L.about, 'about page') + '.',
            hi: 'GAHONSH FREELANCING एक digital solutions studio है, बुंडू, राँची, झारखंड, भारत में, और client दुनिया भर के हैं. काम: Excel automation, PDF और presentation design, website और AI workflow. और जानिए: ' + a(L.about, 'about page') + '.'
        },
        {
            id: 'language',
            kw: ['hindi', 'english', 'language', 'भाषा', 'हिंदी'],
            en: 'You can chat in English or हिंदी (Hinglish is fine too). I reply in whichever language you write in, and the team handles calls and documents in both.',
            hi: 'आप English या हिंदी (Hinglish भी) में चैट कर सकते हैं. आप जिस भाषा में लिखेंगे, मैं उसी में जवाब दूँगा. Team calls और documents दोनों भाषाओं में करती है.'
        },
        {
            id: 'links',
            kw: ['link', 'links', 'all links', 'सारे लिंक', 'url', 'page'],
            en: 'Everything in one place:<br><br>• ' + a(L.services, 'Services') + '<br>• ' + a(L.pricing, 'Pricing') + '<br>• ' + a(L.portfolio, 'Portfolio and samples') + '<br>• ' + a(L.bundle, 'Download all 10 files') + '<br>• ' + a(L.jobs, 'Find Work') + ' and ' + a(L.postJob, 'Post a Job') + '<br>• ' + a(L.contact, 'Contact') + '<br>• ' + a(L.whatsapp, 'WhatsApp') + ' and ' + a(L.email, 'Email'),
            hi: 'सब कुछ एक जगह:<br><br>• ' + a(L.services, 'Services') + '<br>• ' + a(L.pricing, 'Pricing') + '<br>• ' + a(L.portfolio, 'Portfolio और samples') + '<br>• ' + a(L.bundle, 'दसों file download') + '<br>• ' + a(L.jobs, 'Find Work') + ' और ' + a(L.postJob, 'Post a Job') + '<br>• ' + a(L.contact, 'Contact') + '<br>• ' + a(L.whatsapp, 'WhatsApp') + ' और ' + a(L.email, 'Email')
        },
        {
            id: 'thanks',
            kw: ['thanks', 'thank you', 'dhanyavad', 'धन्यवाद', 'शुक्रिया', 'great', 'nice', 'ok', 'okay', 'theek', 'thik'],
            en: 'Happy to help. If you want a quote, just say *quote* and I will take three details.',
            hi: 'खुशी हुई मदद करके. Quote चाहिए तो *quote* लिखिए, तीन details ले लूँगा.'
        },
        {
            id: 'bye',
            kw: ['bye', 'goodbye', 'see you', 'अलविदा', 'बाय'],
            en: 'Thanks for stopping by. The samples stay open at ' + a(L.portfolio, 'portfolio') + ' whenever you need them.',
            hi: 'आने के लिए धन्यवाद. Sample ' + a(L.portfolio, 'portfolio') + ' पर हमेशा खुले हैं, जब ज़रूरत हो देख लीजिए.'
        }
    ];

    var SERVICEISH = { excel: 1, pdf: 1, ppt: 1, web: 1, ai: 1, branding: 1 };
    var MODIFIER = { pricing: 1, timeline: 1, payment: 1, process: 1 };

    var INTENTS = {};
    KB.forEach(function (i) { INTENTS[i.id] = i; });

    var CHIP_LABEL = {
        services: { en: 'Services', hi: 'सेवाएँ' },
        pricing: { en: 'Pricing', hi: 'कीमत' },
        portfolio: { en: 'Portfolio', hi: 'पोर्टफोलियो' },
        excel: { en: 'Excel work', hi: 'Excel काम' },
        excelSamples: { en: 'Excel samples', hi: 'Excel sample' },
        pdf: { en: 'PDF design', hi: 'PDF design' },
        pdfSamples: { en: 'PDF samples', hi: 'PDF sample' },
        deckSample: { en: 'Deck sample', hi: 'Deck sample' },
        bundle: { en: 'All files', hi: 'सारी file' },
        web: { en: 'Website', hi: 'Website' },
        timeline: { en: 'Timeline', hi: 'कितना समय' },
        process: { en: 'How it works', hi: 'कैसे काम' },
        starter: { en: 'Starter plan', hi: 'Starter plan' },
        professional: { en: 'Professional plan', hi: 'Professional plan' },
        quote: { en: 'Get a quote', hi: 'Quote लीजिए' },
        human: { en: 'Talk to a human', hi: 'Team से बात' },
        contactPage: { en: 'Contact form', hi: 'Contact form' },
        links: { en: 'All links', hi: 'सारे link' }
    };

    var DEFAULT_CHIPS = ['services', 'pricing', 'portfolio', 'quote', 'human'];

    /* -------------------------------------------------------------- language */
    var HINGLISH = /\b(kya|kyu|kyun|kaise|kaisa|kitna|kitne|kitni|chahiye|chaiye|batao|bataiye|hai|hain|nahi|nahin|mujhe|muje|karna|karwana|karwane|kaam|kam|paisa|paise|kab|jaldi|accha|acha|theek|thik|haan|han|bhai|bhaiya|dijiye|dijie|kijiye|banwana|banwana|banana|banao|dekho|dikhao|sakte|sakta|milega|milegi|lagta|lagega|aap|tu|tum|mera|meri|apna|koi|kuch|sab|zyada|kam)\b/i;

    function detectLang(text) {
        if (/[\u0900-\u097F]/.test(text)) return 'hi';
        if (HINGLISH.test(text)) return 'hi';
        return 'en';
    }

    function norm(s) {
        return ' ' + String(s).toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ') + ' ';
    }

    function score(text, intent) {
        var n = norm(text);
        var total = 0;
        intent.kw.forEach(function (k) {
            var kk = String(k).toLowerCase().trim();
            if (!kk) return;
            if (kk.indexOf(' ') > -1 || /[\u0900-\u097F]/.test(kk)) {
                if (n.indexOf(' ' + kk + ' ') > -1 || n.indexOf(kk) > -1) total += 3 + kk.split(' ').length;
            } else {
                var re = new RegExp('(^|\\s)' + kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i');
                if (re.test(n)) total += 2 + kk.length / 8;
            }
        });
        return total;
    }

    function best(text) {
        var top = null, topScore = 0;
        KB.forEach(function (i) {
            var s = score(text, i);
            if (s > topScore) { topScore = s; top = i; }
        });
        return topScore >= 2 ? top : null;
    }

    /* --------------------------------------------------------------- helpers */
    var $ = function (sel, root) { return (root || document).querySelector(sel); };

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function fmt(text) {
        return text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    }

    function nowTime() {
        try {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    function store(key, val) {
        try {
            if (val === undefined) return localStorage.getItem(key);
            localStorage.setItem(key, val);
        } catch (e) { return null; }
    }

    /* ------------------------------------------------------------- the widget */
    var CSS = ''
        + '#gc-root{--gc-bg:#0b1220;--gc-panel:#0e1728;--gc-line:rgba(255,255,255,.10);--gc-text:#eaf1ff;--gc-muted:#93a4bd;--gc-accent:#00e0b8;--gc-accent2:#2b8cff;--gc-bubble:#18233a;--gc-user:linear-gradient(135deg,#00d9b2,#2b8cff);'
        + 'position:fixed;z-index:2147483000;right:24px;bottom:108px;font-family:"Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,sans-serif;}'
        + 'body.light-mode #gc-root{--gc-bg:#ffffff;--gc-panel:#ffffff;--gc-line:rgba(15,23,42,.12);--gc-text:#0f172a;--gc-muted:#54637a;--gc-accent:#0d9488;--gc-accent2:#1d4ed8;--gc-bubble:#f1f5f9;}'
        + '#gc-launch{width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#00d9b2,#2b8cff);box-shadow:0 10px 30px rgba(0,180,180,.35);position:relative;transition:transform .18s ease;}'
        + '#gc-launch:hover{transform:scale(1.07);}'
        + '#gc-launch svg{width:27px;height:27px;fill:#04121f;}'
        + '#gc-dot{position:absolute;top:-2px;right:-2px;width:15px;height:15px;background:#22c55e;border:2px solid #04121f;border-radius:50%;}'
        + '#gc-badge{position:absolute;top:-4px;left:-4px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;}'
        + '#gc-panel{position:absolute;right:0;bottom:76px;width:376px;max-width:calc(100vw - 32px);height:min(72vh,610px);background:var(--gc-panel);border:1px solid var(--gc-line);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.45);display:none;flex-direction:column;overflow:hidden;color:var(--gc-text);}'
        + '#gc-panel.open{display:flex;animation:gcIn .18s ease-out;}'
        + '@keyframes gcIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
        + '.gc-head{display:flex;align-items:center;gap:10px;padding:13px 14px;background:linear-gradient(135deg,rgba(0,217,178,.16),rgba(43,140,255,.16));border-bottom:1px solid var(--gc-line);}'
        + '.gc-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00d9b2,#2b8cff);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#04121f;flex:0 0 auto;}'
        + '.gc-tt{flex:1;min-width:0;}'
        + '.gc-tt b{display:block;font-size:14px;letter-spacing:.2px;}'
        + '.gc-tt span{display:block;font-size:11px;color:var(--gc-muted);margin-top:2px;}'
        + '.gc-x{background:transparent;border:0;color:var(--gc-muted);font-size:20px;line-height:1;cursor:pointer;padding:4px 2px;}'
        + '.gc-x:hover{color:var(--gc-text);}'
        + '#gc-log{flex:1;overflow-y:auto;padding:14px 13px 6px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;}'
        + '.gc-row{display:flex;gap:8px;align-items:flex-end;max-width:100%;}'
        + '.gc-row.me{justify-content:flex-end;}'
        + '.gc-b{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;background:var(--gc-bubble);border:1px solid var(--gc-line);word-wrap:break-word;overflow-wrap:anywhere;}'
        + '.gc-row.me .gc-b{background:var(--gc-user);color:#04121f;border:0;font-weight:500;}'
        + '.gc-b a{color:var(--gc-accent2);text-decoration:underline;text-underline-offset:2px;font-weight:600;}'
        + 'body.light-mode .gc-b a{color:#1d4ed8;}'
        + '.gc-row.me .gc-b a{color:#04121f;}'
        + '.gc-t{font-size:10px;color:var(--gc-muted);margin:0 4px 2px;align-self:flex-end;}'
        + '.gc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 13px 10px;}'
        + '.gc-chip{border:1px solid var(--gc-line);background:rgba(255,255,255,.04);color:var(--gc-text);font-size:12px;padding:6px 11px;border-radius:20px;cursor:pointer;font-family:inherit;}'
        + '.gc-chip:hover{border-color:var(--gc-accent);color:var(--gc-accent);}'
        + 'body.light-mode .gc-chip{background:#f8fafc;}'
        + '.gc-form{display:flex;gap:8px;padding:10px 11px;border-top:1px solid var(--gc-line);background:var(--gc-panel);}'
        + '#gc-in{flex:1;background:rgba(255,255,255,.05);border:1px solid var(--gc-line);border-radius:22px;padding:11px 14px;color:var(--gc-text);font-size:13.5px;font-family:inherit;outline:none;min-width:0;}'
        + 'body.light-mode #gc-in{background:#f8fafc;}'
        + '#gc-in:focus{border-color:var(--gc-accent);}'
        + '#gc-send{width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#00d9b2,#2b8cff);display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
        + '#gc-send svg{width:18px;height:18px;fill:#04121f;}'
        + '.gc-foot{font-size:10px;text-align:center;color:var(--gc-muted);padding:0 10px 8px;}'
        + '.gc-typing{display:flex;gap:4px;padding:4px 0;}'
        + '.gc-typing i{width:6px;height:6px;border-radius:50%;background:var(--gc-muted);animation:gcB 1s infinite;}'
        + '.gc-typing i:nth-child(2){animation-delay:.15s}.gc-typing i:nth-child(3){animation-delay:.3s}'
        + '@keyframes gcB{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}'
        + '@media(max-width:480px){#gc-root{right:16px;bottom:98px;}#gc-panel{width:calc(100vw - 24px);right:-4px;height:min(74vh,560px);}}';

    var root = el('div', '');
    root.id = 'gc-root';
    root.innerHTML = ''
        + '<button id="gc-launch" aria-label="Open chat">'
        + '<span id="gc-badge">1</span><span id="gc-dot"></span>'
        + '<svg viewBox="0 0 24 24"><path d="M12 3C6.9 3 2.8 6.5 2.8 10.9c0 2.4 1.2 4.6 3.2 6.1v3.6l3.3-1.8c.9.2 1.8.3 2.7.3 5.1 0 9.2-3.5 9.2-7.9S17.1 3 12 3zm1.1 10.7-2.3-2.4-4.3 2.4 4.7-5 2.4 2.4 4.2-2.4-4.7 5z"/></svg>'
        + '</button>'
        + '<div id="gc-panel" role="dialog" aria-label="Gahonsh assistant">'
        + '<div class="gc-head"><div class="gc-av">G</div><div class="gc-tt"><b>Gahonsh Assistant</b><span>Replies instantly ·हिंदी / English</span></div><button class="gc-x" id="gc-close" aria-label="Close">&times;</button></div>'
        + '<div id="gc-log"></div><div class="gc-chips" id="gc-chips"></div>'
        + '<div class="gc-form"><input id="gc-in" type="text" autocomplete="off" placeholder="Type in English or हिंदी…" aria-label="Message"><button id="gc-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5v6.2L15 12 3 14.3z"/></svg></button></div>'
        + '<div class="gc-foot">Sample names and figures are illustrative.</div>'
        + '</div>';

    var style = el('style', '', CSS);
    document.head.appendChild(style);
    document.body.appendChild(root);

    var launch = $('#gc-launch'), panel = $('#gc-panel'), log = $('#gc-log'),
        chipsBox = $('#gc-chips'), input = $('#gc-in'), sendBtn = $('#gc-send');

    var lang = store('gc_lang') || 'en';
    var lastIntent = null;
    var history = [];
    var flow = { step: 'idle', name: '', email: '', project: '' };
    var leadSaved = store('gc_lead_saved') === '1';

    function t(en, hi) { return lang === 'hi' ? hi : en; }

    function addMsg(who, html, opts) {
        opts = opts || {};
        var row = el('div', 'gc-row' + (who === 'me' ? ' me' : ''));
        var b = el('div', 'gc-b', fmt(html));
        row.appendChild(b);
        log.appendChild(row);
        var tm = el('div', 'gc-t', nowTime());
        log.appendChild(tm);
        log.scrollTop = log.scrollHeight;
        if (!opts.silent) history.push({ who: who, html: html });
        store('gc_hist', JSON.stringify(history.slice(-24)));
    }

    function addTyping() {
        var row = el('div', 'gc-row');
        row.id = 'gc-typing';
        row.innerHTML = '<div class="gc-b"><div class="gc-typing"><i></i><i></i><i></i></div></div>';
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    function killTyping() {
        var t2 = $('#gc-typing');
        if (t2) t2.remove();
    }

    function setChips(ids) {
        chipsBox.innerHTML = '';
        (ids && ids.length ? ids : DEFAULT_CHIPS).forEach(function (id) {
            var label = CHIP_LABEL[id];
            if (!label) return;
            var c = el('button', 'gc-chip', label[lang] || label.en);
            c.type = 'button';
            c.addEventListener('click', function () {
                handleClickChip(id);
            });
            chipsBox.appendChild(c);
        });
    }

    function handleClickChip(id) {
        var intent = INTENTS[id];
        if (!intent) return;
        addMsg('me', CHIP_LABEL[id] ? (CHIP_LABEL[id][lang] || CHIP_LABEL[id].en) : id);
        answerIntent(intent);
    }

    function answerIntent(intent, extra) {
        lastIntent = intent.id;
        if (intent.id === 'quote') flow = { step: 'name', name: '', email: '', project: '' };
        addTyping();
        setTimeout(function () {
            killTyping();
            var body = lang === 'hi' ? intent.hi : intent.en;
            if (extra) body += '<br><br>' + extra;
            addMsg('bot', body);
            setChips(intent.chips);
        }, 380 + Math.min(500, intent.id.length * 12));
    }

    /* ---------------------------------------------------------- quote capture */
    function submitLead() {
        var cfg = window.GAHONSH_CONFIG || {};
        var url = cfg.SUPABASE_URL || 'https://trhmdgbnjtnanajdnxxb.supabase.co';
        var key = cfg.SUPABASE_ANON_KEY || 'sb_publishable_Fe8rUHg-7tN3RpxhjPijw_fX4c786Z';
        var payload = {
            name: flow.name.slice(0, 120),
            email: flow.email.slice(0, 160),
            service: 'Website chat enquiry',
            budget: 'To be confirmed',
            message: ('Website chat: ' + flow.project).slice(0, 2000),
            source: 'website-chat'
        };
        return fetch(url + '/rest/v1/contact_messages', {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        }).then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status);
            return true;
        });
    }

    function finishQuote() {
        flow.step = 'done';
        addTyping();
        submitLead().then(function () {
            killTyping();
            leadSaved = true;
            store('gc_lead_saved', '1');
            addMsg('bot', t(
                'Saved. The team has your details and the enquiry is in the dashboard, so you will hear back at <b>' + escapeHtml(flow.email) + '</b> normally within 1-3 hours.<br><br>Want to attach files or write more? ' + a(L.contact, 'Contact page') + ' &middot; ' + a(L.whatsapp, 'WhatsApp') + '<br><br>Meanwhile, the real samples are here: ' + a(L.bundle, 'download all 10 files'),
                'सेव हो गया. Team के पास आपकी details पहुँच गई हैं और enquiry dashboard में है, जवाब <b>' + escapeHtml(flow.email) + '</b> पर आम तौर पर 1-3 घंटे में आएगा.<br><br>File भेजनी हो या कुछ और लिखना हो: ' + a(L.contact, 'Contact page') + ' &middot; ' + a(L.whatsapp, 'WhatsApp') + '<br><br>तब तक असली sample देखिए: ' + a(L.bundle, 'दसों file download')
            ));
            setChips(['portfolio', 'pricing', 'human']);
        }).catch(function () {
            killTyping();
            addMsg('bot', t(
                'I could not save that just now. Please send it from the ' + a(L.contact, 'contact form') + ' or write to ' + a(L.email, 'gahonsh@gmail.com') + ', and it will reach the team directly.',
                'अभी सेव नहीं हो सका. ' + a(L.contact, 'contact form') + ' से भेज दीजिए या ' + a(L.email, 'gahonsh@gmail.com') + ' पर लिखिए, सीधे team तक पहुँच जाएगा.'
            ));
            setChips(['contactPage', 'human']);
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /* --------------------------------------------------------------- routing */
    function respond(text) {
        var clean = text.trim();
        if (!clean) return;

        // language follows the visitor's message
        lang = detectLang(clean) === 'hi' ? 'hi' : 'en';
        store('gc_lang', lang);

        if (flow.step === 'name') {
            if (/^(cancel|stop|रद्द)\b/i.test(clean)) {
                flow = { step: 'idle', name: '', email: '', project: '' };
                addMsg('bot', t('Cancelled. Ask me anything else.', 'रद्द कर दिया. और कुछ पूछिए.'));
                setChips();
                return;
            }
            flow.name = clean.slice(0, 80);
            flow.step = 'email';
            addTyping();
            setTimeout(function () {
                killTyping();
                addMsg('bot', t('Thanks, ' + escapeHtml(flow.name.split(' ')[0]) + '. What is your *email*? (The quote is sent there.)',
                    'धन्यवाद, ' + escapeHtml(flow.name.split(' ')[0]) + '. आपका *email* क्या है? (Quote वहीं भेजा जाएगा.)'));
            }, 320);
            return;
        }

        if (flow.step === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean)) {
                addTyping();
                setTimeout(function () {
                    killTyping();
                    addMsg('bot', t('That email does not look right. Please type it again, for example name@company.com.',
                        'ये email सही नहीं लग रहा. फिर से लिखिए, जैसे name@company.com.'));
                }, 280);
                return;
            }
            flow.email = clean;
            flow.step = 'project';
            addTyping();
            setTimeout(function () {
                killTyping();
                addMsg('bot', t('Last one: describe the work in one or two lines. For example: "Excel stock dashboard for 500 products" or "5-page company profile PDF".',
                    'आखिरी बात: काम एक-दो लाइन में बताइए. जैसे: "500 product का Excel stock dashboard" या "5-page company profile PDF".'));
            }, 320);
            return;
        }

        if (flow.step === 'project') {
            if (clean.toLowerCase() === 'cancel') {
                flow.step = 'idle';
                addMsg('bot', t('No problem, cancelled. Ask me anything else.', 'कोई बात नहीं, रद्द. और कुछ पूछिए.'));
                setChips();
                return;
            }
            if (clean.length < 4) {
                addMsg('bot', t('A little more detail, please. Even one line is enough.', 'थोड़ा और बताइए. एक लाइन भी काफी है.'));
                return;
            }
            flow.project = clean.slice(0, 1200);
            finishQuote();
            return;
        }

        // plain question routing
        var ranked = KB.map(function (i) { return { i: i, s: score(clean, i) }; })
            .filter(function (x) { return x.s >= 2; })
            .sort(function (x, y) { return y.s - x.s; });
        var intent = ranked.length ? ranked[0].i : null;
        var extra = '';
        if (intent && ranked[1] && ranked[1].s >= 3) {
            var other = ranked[1].i;
            var pair = (SERVICEISH[intent.id] && MODIFIER[other.id]) || (MODIFIER[intent.id] && SERVICEISH[other.id]);
            if (pair && other.b_en) extra = lang === 'hi' ? other.b_hi : other.b_en;
        }
        if (intent) {
            // "price" while talking about excel should keep excel context, but the
            // pricing answer is complete on its own, so no special casing needed.
            answerIntent(intent, extra);
            return;
        }

        addTyping();
        setTimeout(function () {
            killTyping();
            addMsg('bot', t(
                'I did not catch that exactly. I can help with services, prices, timelines, samples and quotes.<br><br>Try: "Excel dashboard price", "show portfolio", "how long for a PDF", or tap a button below. For anything else, ' + a(L.whatsapp, 'WhatsApp the team') + ' or ' + a(L.email, 'email us') + '.',
                'ये ठीक से समझ नहीं आया. मैं service, कीमत, timeline, sample और quote में मदद कर सकता हूँ.<br><br>जैसे लिखिए: "Excel dashboard की कीमत", "portfolio दिखाओ", "PDF में कितना समय", या नीचे button दबाइए. बाकी किसी बात के लिए ' + a(L.whatsapp, 'WhatsApp कीजिए') + ' या ' + a(L.email, 'email कीजिए') + '.'
            ));
            setChips(['services', 'pricing', 'portfolio', 'quote', 'human']);
        }, 360);
    }

    /* ------------------------------------------------------------- open/close */
    function openPanel() {
        panel.classList.add('open');
        $('#gc-badge').style.display = 'none';
        store('gc_seen', '1');
        setTimeout(function () { if (window.innerWidth > 480) input.focus(); }, 120);
        if (log.childElementCount === 0) {
            var saved = store('gc_hist');
            var restored = false;
            if (saved) {
                try {
                    var arr = JSON.parse(saved);
                    if (Array.isArray(arr) && arr.length) {
                        arr.forEach(function (m) { addMsg(m.who, m.html, { silent: true }); });
                        history = arr;
                        restored = true;
                    }
                } catch (e) { /* ignore */ }
            }
            if (!restored) {
                addMsg('bot', t(
                    'Hi! I am the Gahonsh assistant. Ask me anything: services, prices, timelines, or see real sample files.<br><br>For a quote, I only need your name, email and one line about the work.',
                    'नमस्ते! मैं GAHONSH का assistant हूँ. Service, कीमत, timeline कुछ भी पूछिए, या असली sample file देखिए.<br><br>Quote के लिए सिर्फ नाम, email और काम की एक लाइन चाहिए.'
                ));
                setChips();
            } else {
                setChips(['services', 'pricing', 'portfolio', 'quote', 'human']);
            }
        }
    }

    function closePanel() { panel.classList.remove('open'); }

    launch.addEventListener('click', function () {
        if (panel.classList.contains('open')) closePanel(); else openPanel();
    });
    $('#gc-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });

    function send() {
        var v = input.value.trim();
        if (!v) return;
        addMsg('me', escapeHtml(v));
        input.value = '';
        respond(v);
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    // Draw attention once for a new visitor, without stealing focus.
    if (store('gc_seen') !== '1') {
        setTimeout(function () {
            if (!panel.classList.contains('open')) $('#gc-badge').style.display = 'flex';
        }, 6000);
    }

    // Public opener so page buttons and links can start a conversation.
    window.openGahonshChat = openPanel;
    document.addEventListener('click', function (e) {
        var trigger = e.target.closest ? e.target.closest('[data-gahonsh-chat]') : null;
        if (trigger) {
            e.preventDefault();
            openPanel();
        }
    });

    // Optional deep link: any page can open the chat with ?chat=1 or #chat
    try {
        if (/[?&]chat=1/.test(location.search) || location.hash === '#chat') {
            openPanel();
        }
    } catch (e) { /* ignore */ }
})();
