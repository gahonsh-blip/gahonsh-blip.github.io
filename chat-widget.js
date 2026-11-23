/* =========================================================================
   GAHONSH FREELANCING — website assistant chat (bilingual: हिंदी + English)
   Self-contained. No external API, no keys, no per-visitor cost.
   Answers come from a curated knowledge base of the site's real facts.
   Lead capture writes to Supabase contact_messages (owner gets an email).
   ========================================================================= */
(function () {
    'use strict';

    if (window.__gahonshChatLoaded || window.__GAHONSH_STUDIO_PREVIEW__ || document.getElementById('gc-root')) return;
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
            kw: ['human', 'person', 'talk to someone', 'call', 'phone', 'whatsapp', 'contact', 'email', 'support', 'baat karni', 'बात करनी', 'संपर्क', 'agent'],
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
        },
        // Action intents start a guided task instead of returning a canned answer.
        {
            id: 'buildProfileBot', action: 'profile',
            kw: ['build my profile', 'build profile', 'profile banao', 'profile banani', 'profile update', 'update profile', 'edit profile', 'mera profile', 'my profile', 'profile complete', 'profile fill', 'प्रोफाइल बनाओ', 'प्रोफाइल अपडेट', 'प्रोफ़ाइल'],
            chips: []
        },
        {
            id: 'postJobBot', action: 'job',
            kw: ['post a job', 'post job', 'job post', 'job dalna', 'job daal', 'project post', 'hire someone', 'job publish', 'publish job', 'जॉब पोस्ट', 'काम देना', 'project dalna'],
            chips: []
        },
        {
            id: 'proposalBot', action: 'proposal',
            kw: ['submit a proposal', 'proposal bhej', 'proposal submit', 'submit proposal', 'apply to a job', 'bid karna', 'bid submit', 'प्रस्ताव भेज', 'proposal भेज'],
            chips: []
        },
        {
            id: 'uploadResumeBot', action: 'resume',
            kw: ['upload resume', 'resume upload', 'upload cv', 'cv upload', 'resume add', 'add resume', 'रिज्यूमे अपलोड', 'सीवी अपलोड'],
            chips: []
        },
        {
            id: 'profileAudit', action: 'profileAudit',
            kw: ['check my profile', 'profile check', 'profile audit', 'profile review', 'what is missing in my profile', 'profile me kya kami', 'profile mein kya kami', 'mera profile kaisa', 'profile kaisi hai', 'profile improve', 'profile strong', 'प्रोफाइल चेक', 'प्रोफाइल में क्या कमी', 'प्रोफाइल कैसी'],
            chips: []
        },
        {
            id: 'jobAudit', action: 'jobAudit',
            kw: ['check my job', 'job check', 'job audit', 'job review', 'improve my job', 'job improve', 'what is missing in my job post', 'job post me kya kami', 'job post mein kya kami', 'mera job kaisa', 'job post improve', 'जॉब चेक', 'जॉब में क्या कमी', 'जॉब कैसा'],
            chips: []
        },
        {
            id: 'profileFix', action: 'profileFix',
            kw: ['fix my profile', 'profile fix', 'complete my profile', 'profile complete karo', 'profile theek karo', 'profile bhar do', 'profile gaps', 'प्रोफाइल पूरा करो', 'प्रोफाइल ठीक करो'],
            chips: []
        },
        {
            id: 'jobFix', action: 'jobFix',
            kw: ['fix my job', 'job fix', 'improve this job', 'job theek karo', 'job sudharo', 'job post fix', 'जॉब ठीक करो', 'जॉब सुधारो'],
            chips: []
        },
        {
            id: 'botHelp',
            kw: ['what can you do', 'what can i do', 'what do you do for me', 'help', 'kya kar sakta', 'kya kya kaam', 'kya kar sakte', 'commands', 'options', 'capabilities', 'तुम क्या कर सकते', 'क्या कर सकते हो', 'मदद'],
            chips: ['profileAudit', 'jobAudit', 'postJobBot', 'buildProfileBot', 'uploadResume', 'proposalBot', 'findWork', 'human'],
            en: 'I can do these tasks with you:<br><br>• <b>Check my profile</b> — I score your saved profile and tell you what is missing or weak, then I can fill the gaps.<br>• <b>Check my job post</b> — I score a job you posted and tell you what to improve so the offer is clear and attractive.<br>• <b>Post a job</b> — I ask title, category, scope, budget, duration and skills, then publish it (client account).<br>• <b>Build or update a profile</b> — name, title, location, skills, rate and bio (worker or client).<br>• <b>Upload a resume</b> — I open the profile editor for a PDF up to 5 MB (worker).<br>• <b>Submit a proposal</b> — paste a job link, then give your bid, days and cover letter (worker).<br>• <b>Find work / Find talent</b> — open the right directory.<br>• <b>Quote</b> — I take your name, email and project and send it to the team.<br><br>Sign-in is required for checks, posting, applying and saving a profile. I cannot take payments, approve accounts or bypass the site rules.',
            hi: 'मैं आपके साथ ये काम कर सकता हूँ:<br><br>• <b>Profile check</b> — आपकी सेव की हुई profile को score करके बताता हूँ कि क्या कमी है, फिर उसे भर भी सकता हूँ.<br>• <b>Job post check</b> — आपकी post की हुई job को score करके बताता हूँ कि offer को साफ और आकर्षक बनाने के लिए क्या सुधारें.<br>• <b>Job post</b> — title, category, scope, budget, duration और skills पूछकर publish करता हूँ (client account).<br>• <b>Profile बनाना/अपडेट</b> — नाम, title, location, skills, rate और bio (worker या client).<br>• <b>Resume upload</b> — 5 MB तक PDF के लिए profile editor खोलता हूँ (worker).<br>• <b>Proposal भेजना</b> — job link paste कीजिए, फिर bid, days और cover letter (worker).<br>• <b>Find work / Find talent</b> — सही directory खोलता हूँ.<br>• <b>Quote</b> — नाम, email और project लेकर team तक भेजता हूँ.<br><br>Check, post, apply और profile सेव करने के लिए sign-in ज़रूरी है. Payment, account approval या site के नियम bypass करना मैं नहीं कर सकता.'
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
        links: { en: 'All links', hi: 'सारे link' },
        findWork: { en: 'Find work', hi: 'काम खोजें' },
        hireTalent: { en: 'Find talent', hi: 'Talent खोजें' },
        botHelp: { en: 'What I can do', hi: 'मैं क्या कर सकता हूँ' },
        profileAudit: { en: 'Check my profile', hi: 'Profile check करें' },
        jobAudit: { en: 'Check my job post', hi: 'Job post check करें' },
        fixProfile: { en: 'Fix my profile', hi: 'Profile पूरा करें' },
        fixJob: { en: 'Improve this job', hi: 'Job सुधारें' },
        postJobBot: { en: 'Post a job', hi: 'Job post करें' },
        buildProfileBot: { en: 'Build my profile', hi: 'Profile बनाएँ' },
        proposalBot: { en: 'Submit a proposal', hi: 'Proposal भेजें' },
        uploadResume: { en: 'Upload resume', hi: 'Resume upload' },
        dashboard: { en: 'My portal', hi: 'मेरा portal' },
        signIn: { en: 'Sign in', hi: 'Sign in' },
        continueTask: { en: 'Continue', hi: 'जारी रखें' },
        cancelTask: { en: 'Cancel', hi: 'रद्द करें' },
        skipTask: { en: 'Skip', hi: 'छोड़ें' },
        confirmTask: { en: 'Confirm', hi: 'पक्का करें' },
        editTask: { en: 'Edit', hi: 'बदलें' }
    };

    // Chips that drive a guided task get a stronger visual treatment.
    var ACTION_CHIPS = {
        postJobBot: 1, buildProfileBot: 1, proposalBot: 1, uploadResume: 1,
        profileAudit: 1, jobAudit: 1, fixProfile: 1, fixJob: 1,
        dashboard: 1, signIn: 1, continueTask: 1, cancelTask: 1,
        skipTask: 1, confirmTask: 1, editTask: 1
    };

    var DEFAULT_CHIPS = ['postJobBot', 'buildProfileBot', 'proposalBot', 'botHelp', 'services', 'pricing', 'human'];

    /* -------------------------------------------------------------- language */
    var HINGLISH = /\b(kya|kyu|kyun|kaise|kaisa|kitna|kitne|kitni|chahiye|chaiye|batao|bataiye|hai|hain|nahi|nahin|mujhe|muje|karna|karwana|karwane|kaam|kam|paisa|paise|kab|jaldi|accha|acha|theek|thik|haan|han|bhai|bhaiya|dijiye|dijie|kijiye|banwana|banwana|banana|banao|dekho|dikhao|sakte|sakta|milega|milegi|lagta|lagega|aap|tu|tum|mera|meri|apna|koi|kuch|sab|zyada|kam)\b/i;

    function detectLang(text) {
        if (/[\u0900-\u097F]/.test(text)) return 'hi';
        if (HINGLISH.test(text)) return 'hi';
        return 'en';
    }

    function norm(s) {
        // Keep combining marks (\p{M}) so Devanagari vowel signs survive;
        // otherwise "प्रोफाइल" is stripped and never matches its keyword.
        return ' ' + String(s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ') + ' ';
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
        + 'position:fixed;z-index:99998;right:24px;bottom:108px;font-family:"Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,sans-serif;}'
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
        + '.gc-chip.gc-chip-action{border-color:rgba(0,224,184,.5);background:rgba(0,224,184,.09);font-weight:600;}'
        + 'body.light-mode .gc-chip.gc-chip-action{background:#ecfdf5;border-color:#0d9488;}'
        + '.gc-step{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--gc-accent);margin-bottom:4px;}'
        + '.gc-summary{margin-top:8px;padding:10px 11px;border:1px solid var(--gc-line);border-radius:10px;background:rgba(255,255,255,.03);font-size:12.5px;line-height:1.6;}'
        + 'body.light-mode .gc-summary{background:#f8fafc;}'
        + '.gc-audit{margin-top:2px;}'
        + '.gc-audit-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;margin-bottom:6px;}'
        + '.gc-audit-head span{font-weight:800;color:var(--gc-accent);white-space:nowrap;}'
        + '.gc-audit-bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:9px;}'
        + 'body.light-mode .gc-audit-bar{background:#e2e8f0;}'
        + '.gc-audit-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#00d9b2,#2b8cff);}'
        + '.gc-audit-item{display:flex;gap:7px;font-size:12.5px;line-height:1.45;margin:6px 0;}'
        + '.gc-audit-item>div{min-width:0;overflow-wrap:anywhere;}'
        + '.gc-audit-icon{flex:0 0 auto;}'
        + '.gc-audit-item b{font-weight:700;}'
        + '.gc-audit-missing b{color:#f87171;}'
        + '.gc-audit-warn b{color:#fbbf24;}'
        + 'body.light-mode .gc-audit-missing b{color:#b91c1c;}'
        + 'body.light-mode .gc-audit-warn b{color:#b45309;}'
        + '.gc-audit-tips{margin-top:9px;padding-top:8px;border-top:1px dashed var(--gc-line);font-size:12px;line-height:1.55;color:var(--gc-muted);}'
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
        + '@media(max-width:480px){#gc-root{right:16px;bottom:98px;}#gc-panel{width:calc(100vw - 24px);right:-4px;height:min(74vh,560px);}'
        + '.gc-chip{min-height:48px;padding:10px 14px;font-size:13px;}.gc-x{width:48px;height:48px;padding:0;display:inline-flex;align-items:center;justify-content:center;}'
        + '#gc-in{min-height:48px;}#gc-send{width:48px;height:48px;}}';

    var root = el('div', '');
    root.id = 'gc-root';
    root.innerHTML = ''
        + '<button id="gc-launch" aria-label="Open chat">'
        + '<span id="gc-badge">1</span><span id="gc-dot"></span>'
        + '<svg viewBox="0 0 24 24"><path d="M12 3C6.9 3 2.8 6.5 2.8 10.9c0 2.4 1.2 4.6 3.2 6.1v3.6l3.3-1.8c.9.2 1.8.3 2.7.3 5.1 0 9.2-3.5 9.2-7.9S17.1 3 12 3zm1.1 10.7-2.3-2.4-4.3 2.4 4.7-5 2.4 2.4 4.2-2.4-4.7 5z"/></svg>'
        + '</button>'
        + '<div id="gc-panel" role="dialog" aria-label="Gahonsh assistant">'
        + '<div class="gc-head"><div class="gc-av">G</div><div class="gc-tt"><b>Gahonsh Assistant</b><span>Jobs, profiles, quotes · हिंदी / English</span></div><button class="gc-x" id="gc-close" aria-label="Close">&times;</button></div>'
        + '<div id="gc-log" aria-live="polite"></div><div class="gc-chips" id="gc-chips"></div>'
        + '<div class="gc-form"><input id="gc-in" type="text" autocomplete="off" placeholder="Type in English or हिंदी…" aria-label="Message"><button id="gc-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5v6.2L15 12 3 14.3z"/></svg></button></div>'
        + '<div class="gc-foot">I can post a job or build your profile for you.</div>'
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
            var c = el('button', 'gc-chip' + (ACTION_CHIPS[id] ? ' gc-chip-action' : ''), label[lang] || label.en);
            c.type = 'button';
            c.addEventListener('click', function () {
                handleClickChip(id);
            });
            chipsBox.appendChild(c);
        });
    }

    function handleClickChip(id) {
        // A chip always starts a fresh action. Clear a pending job picker so
        // the next typed message is not swallowed by the picker state.
        jobPicker = null;
        var label = CHIP_LABEL[id] ? (CHIP_LABEL[id][lang] || CHIP_LABEL[id].en) : id;
        if (ACTION_HANDLERS[id]) {
            addMsg('me', label);
            if (!ACTION_CHIPS[id]) pendingTask = null;
            ACTION_HANDLERS[id]();
            return;
        }
        var intent = INTENTS[id];
        if (!intent) return;
        if (task) {
            task = null;
            addMsg('bot', t('I stopped the previous task. Nothing was saved.', 'पिछला काम रोक दिया. कुछ सेव नहीं हुआ.'));
        }
        pendingTask = null;
        addMsg('me', label);
        answerIntent(intent);
    }

    function answerIntent(intent, extra) {
        if (intent.action) {
            startTask(intent.action);
            return;
        }
        lastIntent = intent.id;
        if (intent.id === 'quote') {
            task = null;
            pendingTask = null;
            flow = { step: 'name', name: '', email: '', project: '' };
        }
        addTyping();
        setTimeout(function () {
            killTyping();
            var body = lang === 'hi' ? intent.hi : intent.en;
            if (extra) body += '<br><br>' + extra;
            addMsg('bot', body);
            setChips(intent.chips);
        }, 380 + Math.min(500, intent.id.length * 12));
    }

    /* ------------------------------------------------------------ guided tasks */
    // The assistant can collect a profile, a job or a proposal step by step and
    // then call the same GahonshDB service the page forms use. No API key and no
    // server: the browser does the work, and the existing RLS rules still apply.
    var task = null;
    var pendingTask = null;
    var jobPicker = null;
    var lastProfileAudit = null;
    var lastJobAudit = null;
    var greetedUserId = null;
    // Bumped when the account changes or signs out. Async reads and writes
    // compare it before showing data, so a late response cannot leak the
    // previous user's profile or job into the cleared chat.
    var chatEpoch = 0;

    var JOB_CATEGORIES = [
        { value: 'Excel Automation', en: 'Excel & Spreadsheet Automation', hi: 'Excel और Spreadsheet Automation' },
        { value: 'Web Engineering', en: 'Full-Stack Web Development', hi: 'Full-Stack Web Development' },
        { value: 'PDF & Design', en: 'PDF Layouts & Brand Documents', hi: 'PDF Layout और Brand Documents' },
        { value: 'Python & AI', en: 'Python & AI Workflow Automation', hi: 'Python और AI Workflow Automation' },
        { value: 'Data & Analytics', en: 'Data Intelligence & Dashboards', hi: 'Data Intelligence और Dashboards' },
        { value: 'Mobile Development', en: 'Mobile Application Development', hi: 'Mobile Application Development' }
    ];
    var JOB_DURATIONS = [
        { value: 'Less than 1 month', en: 'Less than 1 month', hi: '1 महीने से कम' },
        { value: '1 to 3 months', en: '1 to 3 months', hi: '1 से 3 महीने' },
        { value: '3 to 6 months', en: '3 to 6 months', hi: '3 से 6 महीने' },
        { value: 'More than 6 months', en: 'More than 6 months', hi: '6 महीने से ज़्यादा' }
    ];
    var JOB_LEVELS = [
        { value: 'entry', en: 'Entry level', hi: 'Entry level' },
        { value: 'intermediate', en: 'Intermediate', hi: 'Intermediate' },
        { value: 'expert', en: 'Expert', hi: 'Expert' }
    ];
    var JOB_TYPES = [
        { value: 'fixed', en: 'Fixed price for the whole project', hi: 'पूरे project की fixed price' },
        { value: 'hourly', en: 'Hourly rate', hi: 'Hourly rate' }
    ];

    function choiceList(options) {
        return options.map(function (o, i) {
            return (i + 1) + '. ' + (lang === 'hi' ? (o.hi || o.en) : o.en);
        }).join('<br>');
    }

    function parseChoice(text, options) {
        var raw = String(text).trim();
        var num = parseInt(raw, 10);
        if (/^\d+$/.test(raw) && num >= 1 && num <= options.length) {
            return { value: options[num - 1].value };
        }
        var lower = raw.toLowerCase();
        var match = options.filter(function (o) {
            return String(o.value).toLowerCase() === lower ||
                String(o.en || '').toLowerCase() === lower;
        })[0];
        if (match) return { value: match.value };
        match = options.filter(function (o) {
            var hay = (String(o.value) + ' ' + String(o.en || '')).toLowerCase();
            return lower.length > 2 && hay.indexOf(lower) > -1;
        })[0];
        if (match) return { value: match.value };
        return { error: true };
    }

    function parseNumber(text) {
        var n = Number(String(text).replace(/[^0-9.]/g, ''));
        return isFinite(n) ? n : NaN;
    }

    function parseSkillList(text) {
        var seen = {};
        return String(text).split(',').map(function (s) {
            return s.trim();
        }).filter(function (s) {
            if (!s || seen[s.toLowerCase()]) return false;
            seen[s.toLowerCase()] = 1;
            return true;
        }).slice(0, 20).map(function (s) {
            return s.slice(0, 40);
        });
    }

    function displayTaskValue(value) {
        if (value === undefined || value === null || value === '') return '—';
        if (Array.isArray(value)) return value.join(', ') || '—';
        if (typeof value === 'object') {
            if (value.title) return value.title;
            if (value.fixed !== undefined) return '$' + value.fixed;
            if (value.min !== undefined) return '$' + value.min + '/hr – $' + value.max + '/hr';
        }
        return String(value);
    }

    /* ----------------------------------------------------------- audit engine */
    // A profile/job check is a deterministic rubric, not a guess: each item has
    // a weight, a status (ok / warn / missing) and a fixable flag. The same
    // checks drive the summary and the guided "fill the gaps" flow.
    function auditItem(key, labelEn, labelHi, weight, status, detailEn, detailHi, fixable) {
        return {
            key: key,
            label_en: labelEn,
            label_hi: labelHi,
            weight: weight,
            status: status,
            detail_en: detailEn,
            detail_hi: detailHi,
            fixable: fixable !== false
        };
    }

    // A title is generic when every meaningful word is a role label or a
    // seniority modifier. "Freelance Specialist" is generic; "Senior Excel
    // Automation Specialist" and "React Developer" are specific.
    var GENERIC_TITLE_MODIFIERS = /^(senior|junior|lead|principal|chief|head|freelance|independent|फ्रीलांस|स्वतंत्र|वरिष्ठ|जूनियर|प्रमुख|लीड)$/i;
    var GENERIC_TITLE_ROLES = /^(freelancer|professional|expert|specialist|consultant|developer|designer|engineer|worker|client|architect|analyst|writer|marketer|strategist|फ्रीलांसर|पेशेवर|विशेषज्ञ|सलाहकार|डेवलपर|डिज़ाइनर|इंजीनियर|कर्मचारी|ग्राहक|आर्किटेक्ट|विश्लेषक|लेखक|मार्केटर|रणनीतिकार)$/i;

    function isGenericProfileTitle(title) {
        var tokens = String(title || '').toLowerCase().split(/[\s,./-]+/).filter(Boolean);
        var meaningful = tokens.filter(function (token) {
            return !GENERIC_TITLE_MODIFIERS.test(token);
        });
        return meaningful.length === 0 || meaningful.every(function (token) {
            return GENERIC_TITLE_ROLES.test(token);
        });
    }

    var JOB_TITLE_FILLER = /^(need|needs|needed|help|work|project|job|task|urgent|simple|cheap|quick|easy|someone|person|required|wanted|looking|for|a|an|the|please|my|our|build|create|design|make|fix|do|done|small|big|new|काम|मदद|प्रोजेक्ट|परियोजना|जरूरत|ज़रूरत|चाहिए|तुरंत|सरल|सस्ता|जल्दी|आसान|कोई|व्यक्ति|आवश्यक|ढूंढ|रहा|हूँ|हूं|के|लिए|एक|मेरा|हमारा|बनाओ|बनाएं|डिजाइन|करो|करें|ठीक|छोटा|बड़ा|नया)$/i;
    var JOB_TITLE_ROLES = /^(developer|designer|expert|freelancer|engineer|consultant|specialist|programmer|writer|marketer|assistant|manager|analyst|architect|डेवलपर|डिज़ाइनर|विशेषज्ञ|फ्रीलांसर|इंजीनियर|सलाहकार|प्रोग्रामर|लेखक|मार्केटर|सहायक|मैनेजर|विश्लेषक|आर्किटेक्ट)$/i;

    function isGenericJobTitle(title) {
        var tokens = String(title || '').toLowerCase().split(/[\s,./-]+/).filter(Boolean);
        var meaningful = tokens.filter(function (token) {
            return !JOB_TITLE_FILLER.test(token);
        });
        return meaningful.length === 0 || meaningful.every(function (token) {
            return JOB_TITLE_ROLES.test(token);
        });
    }

    function auditScore(items) {
        var total = items.reduce(function (sum, item) { return sum + item.weight; }, 0) || 1;
        var earned = items.reduce(function (sum, item) {
            if (item.status === 'ok') return sum + item.weight;
            if (item.status === 'warn') return sum + item.weight * 0.5;
            return sum;
        }, 0);
        return Math.round((earned / total) * 100);
    }

    function auditProfile(profile) {
        profile = profile || {};
        var role = profile.role === 'client' ? 'client' : 'freelancer';
        var items = [];

        var name = String(profile.full_name || '').trim();
        items.push(auditItem('full_name', 'Full name', 'पूरा नाम', role === 'client' ? 20 : 10,
            name.length >= 2 ? 'ok' : 'missing',
            name.length >= 2 ? 'Your name is visible on your profile.' : 'Add your full name so clients know who they are talking to.',
            name.length >= 2 ? 'आपका नाम profile पर दिख रहा है.' : 'अपना पूरा नाम जोड़िए ताकि client जान सके किससे बात हो रही है.'));

        var title = String(profile.title || '').trim();
        var genericTitle = isGenericProfileTitle(title);
        if (!title) {
            items.push(auditItem('title', 'Professional title', 'Professional title', role === 'client' ? 25 : 20, 'missing',
                'Add a specific title, e.g. "Excel Automation Expert" or "Full-Stack Developer".',
                'खास title जोड़िए, जैसे "Excel Automation Expert" या "Full-Stack Developer".'));
        } else if (title.length < 8 || genericTitle) {
            items.push(auditItem('title', 'Professional title', 'Professional title', role === 'client' ? 25 : 20, 'warn',
                '“' + title + '” is too broad. Name the role and speciality, e.g. "Senior React Developer".',
                '“' + title + '” बहुत सामान्य है. Role और speciality लिखिए, जैसे "Senior React Developer".'));
        } else {
            items.push(auditItem('title', 'Professional title', 'Professional title', role === 'client' ? 25 : 20, 'ok',
                'Your title is specific enough.', 'आपका title ठीक है.'));
        }

        var location = String(profile.location || '').trim();
        items.push(auditItem('location', 'Location', 'Location', role === 'client' ? 15 : 10,
            location ? 'ok' : 'missing',
            location ? 'Location is set.' : 'Add your city or "Remote" so clients can see your time zone.',
            location ? 'Location सेट है.' : 'अपना शहर या "Remote" जोड़िए ताकि client time zone देख सके.'));

        if (role === 'freelancer') {
            var skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
            if (!skills.length) {
                items.push(auditItem('skills', 'Skills', 'Skills', 20, 'missing',
                    'Add 3-5 tools you actually use, e.g. Excel VBA, Python, React.',
                    '3-5 tools जोड़िए जो आप सच में इस्तेमाल करते हैं, जैसे Excel VBA, Python, React.'));
            } else if (skills.length < 3) {
                items.push(auditItem('skills', 'Skills', 'Skills', 20, 'warn',
                    'You have ' + skills.length + ' skill(s). Add 2-3 more so clients can find you.',
                    'आपके पास ' + skills.length + ' skill हैं. 2-3 और जोड़िए ताकि client आपको ढूँढ सके.'));
            } else {
                items.push(auditItem('skills', 'Skills', 'Skills', 20, 'ok',
                    skills.length + ' skills listed.', skills.length + ' skills listed.'));
            }

            var rate = Number(profile.hourly_rate) || 0;
            items.push(auditItem('hourly_rate', 'Hourly rate (USD)', 'Hourly rate (USD)', 15,
                rate > 0 ? 'ok' : 'missing',
                rate > 0 ? 'Your rate is $' + rate + '/hr.' : 'Set an hourly rate so clients can compare budgets.',
                rate > 0 ? 'आपकी rate $' + rate + '/hr है.' : 'Hourly rate सेट कीजिए ताकि client budget compare कर सके.'));

            var bio = String(profile.bio || '').trim();
            if (!bio) {
                items.push(auditItem('bio', 'Bio', 'Bio', 15, 'missing',
                    'Write 3-4 lines: years of experience, 2 delivered outcomes and the tools you use.',
                    '3-4 लाइन लिखिए: अनुभव, 2 delivered outcomes और tools.'));
            } else if (bio.length < 80) {
                items.push(auditItem('bio', 'Bio', 'Bio', 15, 'warn',
                    'Your bio is ' + bio.length + ' characters. Add a delivered outcome with a number.',
                    'आपका bio ' + bio.length + ' अक्षर है. किसी delivered outcome को number के साथ जोड़िए.'));
            } else {
                items.push(auditItem('bio', 'Bio', 'Bio', 15, 'ok',
                    'Your bio has enough detail.', 'आपका bio ठीक है.'));
            }

            var resumeKnown = profile.has_resume !== undefined ||
                profile.resume_name !== undefined || profile.resume_size_bytes !== undefined;
            if (resumeKnown) {
                var hasResume = profile.has_resume === true || !!profile.resume_name;
                items.push(auditItem('resume', 'Resume / CV', 'Resume / CV', 10,
                    hasResume ? 'ok' : 'missing',
                    hasResume ? 'A PDF resume is on your profile.' : 'Upload a PDF resume so clients can review your CV.',
                    hasResume ? 'आपकी profile पर PDF resume है.' : 'PDF resume अपलोड कीजिए ताकि client आपका CV देख सके.',
                    false));
            }
        } else {
            var about = String(profile.bio || '').trim();
            if (!about) {
                items.push(auditItem('bio', 'Company / about', 'Company / about', 40, 'missing',
                    'Write 3-4 lines about your business, the team and the kind of projects you hire for.',
                    'अपने business, team और किस तरह के projects पर hire करते हैं, 3-4 लाइन में लिखिए.'));
            } else if (about.length < 80) {
                items.push(auditItem('bio', 'Company / about', 'Company / about', 40, 'warn',
                    'Your about section is ' + about.length + ' characters. Add what your company does and the results you need.',
                    'आपका about ' + about.length + ' अक्षर है. Company क्या करती है और क्या result चाहिए, जोड़िए.'));
            } else {
                items.push(auditItem('bio', 'Company / about', 'Company / about', 40, 'ok',
                    'Your about section has enough detail.', 'आपका about ठीक है.'));
            }
        }

        var tips = role === 'freelancer' ? [
            t('Lead with outcomes, not duties: "cut reporting time by 60%".', 'Duties नहीं, outcomes लीड कीजिए: "reporting time 60% कम किया".'),
            t('Use 5-8 skills you can demo in a call.', '5-8 ऐसी skills लिखिए जो call में दिखा सकें.'),
            t('Add a PDF resume and keep it to 1-2 pages.', 'PDF resume जोड़िए और 1-2 page रखिए.'),
            t('Set a realistic hourly rate; you can adjust it later.', 'वास्तविक hourly rate रखिए; बाद में बदल सकते हैं.')
        ] : [
            t('Say what your company does and the kind of projects you hire for.', 'बताइए आपकी company क्या करती है और किस तरह के projects पर hire करती है.'),
            t('Add the results you need, not just the tasks.', 'सिर्फ tasks नहीं, जो result चाहिए वो भी लिखिए.'),
            t('Mention your time zone and how you like to communicate.', 'अपना time zone और communication style लिखिए.')
        ];
        var gaps = items.filter(function (item) { return item.status !== 'ok'; });
        return { kind: 'profile', role: role, items: items, score: auditScore(items), gaps: gaps.length, tips: tips };
    }

    function auditJob(job) {
        job = job || {};
        var items = [];

        var title = String(job.title || '').trim();
        var genericTitle = isGenericJobTitle(title);
        if (!title) {
            items.push(auditItem('title', 'Project title', 'Project title', 15, 'missing',
                'Add a specific title with the outcome, e.g. "Automated Excel Sales Dashboard with Monthly KPIs".',
                'Outcome के साथ खास title लिखिए, जैसे "Automated Excel Sales Dashboard with Monthly KPIs".'));
        } else if (title.length < 15 || genericTitle) {
            items.push(auditItem('title', 'Project title', 'Project title', 15, 'warn',
                '“' + title + '” is short or generic. Name the outcome, e.g. "Automated Excel Sales Dashboard".',
                '“' + title + '” छोटा या सामान्य है. Outcome लिखिए, जैसे "Automated Excel Sales Dashboard".'));
        } else {
            items.push(auditItem('title', 'Project title', 'Project title', 15, 'ok',
                'Your title is specific.', 'आपका title ठीक है.'));
        }

        items.push(auditItem('category', 'Category', 'Category', 5,
            job.category ? 'ok' : 'missing',
            job.category ? 'Category: ' + job.category : 'Choose a category so the right workers see it.',
            job.category ? 'Category: ' + job.category : 'Category चुनिए ताकि सही worker को दिखे.'));

        var desc = String(job.description || '').trim();
        var lower = desc.toLowerCase();
        var keywords = ['deliver', 'build', 'create', 'design', 'automate', 'report', 'dashboard', 'page', 'app',
            'api', 'data', 'excel', 'pdf', 'website', 'tool', 'format', 'example', 'success', 'timeline',
            'deadline', 'require', 'accept'];
        var hits = keywords.filter(function (k) { return lower.indexOf(k) > -1; }).length;
        // The keyword list is English. A long Hindi description should not be
        // marked weak just because it has no English keywords.
        var englishWords = (desc.match(/[A-Za-z]{3,}/g) || []).length;
        if (desc.length < 30) {
            items.push(auditItem('description', 'Scope', 'Scope', 30, 'missing',
                'Describe the work: deliverables, tools, timeline and what success looks like. Aim for 120+ characters.',
                'काम बताइए: deliverables, tools, timeline और success क्या होगा. 120+ अक्षर लिखिए.'));
        } else if (desc.length < 120 || (englishWords >= 3 && hits < 2)) {
            items.push(auditItem('description', 'Scope', 'Scope', 30, 'warn',
                'Your scope is ' + desc.length + ' characters. Add the exact deliverables, tools and what success looks like.',
                'आपका scope ' + desc.length + ' अक्षर है. साफ deliverables, tools और success जोड़िए.'));
        } else {
            items.push(auditItem('description', 'Scope', 'Scope', 30, 'ok',
                'Your scope explains the deliverables and context.', 'आपका scope deliverables और context समझाता है.'));
        }

        var jobType = job.job_type === 'hourly' ? 'hourly' : 'fixed';
        var fixed = Number(job.budget_min) || 0;
        var hmin = Number(job.hourly_rate_min) || 0;
        var hmax = Number(job.hourly_rate_max) || 0;
        if (jobType === 'hourly') {
            if (!hmin || !hmax || hmax < hmin) {
                items.push(auditItem('budget', 'Hourly range', 'Hourly range', 15, 'missing',
                    'Add an hourly range, e.g. 25-60 USD.', 'Hourly range जोड़िए, जैसे 25-60 USD.'));
            } else if (hmax < 10) {
                items.push(auditItem('budget', 'Hourly range', 'Hourly range', 15, 'warn',
                    'Your hourly range is $' + hmin + '-$' + hmax + '. Very low rates can attract fewer serious bids.',
                    'आपकी hourly range $' + hmin + '-$' + hmax + ' है. बहुत कम rate पर कम serious bids आ सकते हैं.'));
            } else {
                items.push(auditItem('budget', 'Hourly range', 'Hourly range', 15, 'ok',
                    'Hourly range: $' + hmin + '-$' + hmax + '.', 'Hourly range: $' + hmin + '-$' + hmax + '.'));
            }
        } else if (fixed < 20) {
            items.push(auditItem('budget', 'Fixed budget', 'Fixed budget', 15, 'missing',
                'Add a fixed budget of at least $20.', 'कम से कम $20 का fixed budget जोड़िए.'));
        } else if (fixed < 50) {
            items.push(auditItem('budget', 'Fixed budget', 'Fixed budget', 15, 'warn',
                'Your fixed budget is $' + fixed + '. Very low budgets can attract fewer serious bids; check that it matches the scope.',
                'आपका fixed budget $' + fixed + ' है. बहुत कम budget पर कम serious bids आ सकते हैं; scope से मिलाइए.'));
        } else {
            items.push(auditItem('budget', 'Fixed budget', 'Fixed budget', 15, 'ok',
                'Fixed budget: $' + fixed + '.', 'Fixed budget: $' + fixed + '.'));
        }

        items.push(auditItem('duration', 'Duration', 'Duration', 10,
            job.estimated_duration ? 'ok' : 'missing',
            job.estimated_duration ? 'Duration: ' + job.estimated_duration : 'Add an estimated duration.',
            job.estimated_duration ? 'Duration: ' + job.estimated_duration : 'अनुमानित duration जोड़िए.'));

        items.push(auditItem('experience', 'Experience level', 'Experience level', 10,
            job.experience_level ? 'ok' : 'missing',
            job.experience_level ? 'Level: ' + job.experience_level : 'Choose the experience level you need.',
            job.experience_level ? 'Level: ' + job.experience_level : 'ज़रूरी experience level चुनिए.'));

        var skills = Array.isArray(job.required_skills) ? job.required_skills.filter(Boolean) : [];
        if (!skills.length) {
            items.push(auditItem('skills', 'Required skills', 'Required skills', 15, 'missing',
                'Add 3-5 required skills so the right workers find it.',
                '3-5 required skills जोड़िए ताकि सही worker को दिखे.'));
        } else if (skills.length < 3) {
            items.push(auditItem('skills', 'Required skills', 'Required skills', 15, 'warn',
                'You listed ' + skills.length + ' skill(s). Add 1-2 more.',
                'आपने ' + skills.length + ' skill लिखी हैं. 1-2 और जोड़िए.'));
        } else {
            items.push(auditItem('skills', 'Required skills', 'Required skills', 15, 'ok',
                skills.length + ' skills listed.', skills.length + ' skills listed.'));
        }

        var tips = [
            t('Start with one line about your business and the outcome you need.', 'पहली लाइन में business और ज़रूरी outcome लिखिए.'),
            t('List exact deliverables and file formats.', 'साफ deliverables और file formats लिखिए.'),
            t('Name the tools and add one example if you have it.', 'Tools के नाम लिखिए और एक example दीजिए.'),
            t('Say what success looks like, and mention the timeline and budget range.', 'Success क्या होगा बताइए, timeline और budget range लिखिए.')
        ];
        var gaps = items.filter(function (item) { return item.status !== 'ok'; });
        return { kind: 'job', items: items, score: auditScore(items), gaps: gaps.length, tips: tips };
    }

    function renderAudit(audit) {
        var heading = audit.kind === 'profile'
            ? t('Profile check', 'प्रोफाइल चेक')
            : t('Job post check', 'जॉब पोस्ट चेक');
        var rows = audit.items.map(function (item) {
            var icon = item.status === 'ok' ? '✅' : item.status === 'warn' ? '⚠️' : '❌';
            return '<div class="gc-audit-item gc-audit-' + item.status + '"><span class="gc-audit-icon" aria-hidden="true">' + icon + '</span><div><b>' +
                escapeHtml(t(item.label_en, item.label_hi)) + '</b><br>' +
                escapeHtml(t(item.detail_en, item.detail_hi)) + '</div></div>';
        }).join('');
        var tips = audit.tips && audit.tips.length
            ? '<div class="gc-audit-tips"><b>' + t('To make it stronger', 'और मजबूत बनाने के लिए') + '</b><br>• ' +
                audit.tips.map(function (tip) { return escapeHtml(tip); }).join('<br>• ') + '</div>'
            : '';
        var score = Math.max(0, Math.min(100, Math.round(audit.score)));
        return '<div class="gc-audit"><div class="gc-audit-head"><b>' + escapeHtml(heading) + '</b><span>' + score + '/100</span></div>' +
            '<div class="gc-audit-bar" role="progressbar" aria-label="' + escapeHtml(t('Score', 'स्कोर')) +
            '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + score + '"><i style="width:' + score + '%"></i></div>' +
            rows + tips + '</div>';
    }

    function showProfileAudit(profile) {
        var audit = auditProfile(profile);
        lastProfileAudit = { profile: profile, audit: audit };
        addMsg('bot', renderAudit(audit));
        var fixableGaps = audit.items.some(function (item) {
            return item.status !== 'ok' && item.fixable;
        });
        var resumeGap = audit.items.some(function (item) {
            return item.key === 'resume' && item.status !== 'ok';
        });
        if (fixableGaps) {
            setChips(audit.role === 'client'
                ? ['fixProfile', 'dashboard', 'human']
                : ['fixProfile', 'uploadResume', 'dashboard', 'human']);
        } else if (resumeGap) {
            setChips(['uploadResume', 'dashboard', 'human']);
        } else if (audit.role === 'client') {
            setChips(['jobAudit', 'postJobBot', 'dashboard', 'human']);
        } else {
            setChips(['findWork', 'dashboard', 'human']);
        }
        return audit;
    }

    function showJobAudit(job) {
        var audit = auditJob(job);
        lastJobAudit = { job: job, audit: audit };
        addMsg('bot', renderAudit(audit));
        if (audit.gaps) {
            setChips(['fixJob', 'postJobBot', 'dashboard', 'human']);
        } else {
            setChips(['postJobBot', 'hireTalent', 'dashboard', 'human']);
        }
        return audit;
    }

    function extractJobId(text) {
        var raw = String(text || '').trim();
        var match = raw.match(/[?&]id=([^&\s#]+)/i);
        if (match) {
            try {
                raw = decodeURIComponent(match[1]);
            } catch (e) {
                return null;
            }
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
            return raw.toLowerCase();
        }
        if (/^(demo-)?job[_-][A-Za-z0-9-]+$/i.test(raw)) return raw.toLowerCase();
        return null;
    }

    async function fetchMyProfile(user) {
        var profile = (user && user.profile) || {};
        try {
            if (window.GahonshDB && window.GahonshDB.Profiles && window.GahonshDB.Profiles.getMyProfile) {
                profile = (await window.GahonshDB.Profiles.getMyProfile()) || profile;
            }
        } catch (e) { /* fall back to the auth profile */ }
        return profile;
    }

    async function startProfileAudit() {
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        if (!user) {
            killTyping();
            pendingTask = 'profileAudit';
            promptSignIn();
            return;
        }
        var profile = await fetchMyProfile(user);
        if (epoch !== chatEpoch) { killTyping(); return; }
        killTyping();
        addMsg('bot', t('I read your saved profile. Here is the check:', 'मैंने आपकी सेव की हुई profile पढ़ी. यह check है:'));
        showProfileAudit(profile);
    }

    async function startJobAudit() {
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        if (!user) {
            killTyping();
            pendingTask = 'jobAudit';
            promptSignIn();
            return;
        }
        var role = (user.profile && user.profile.role) || '';
        if (role !== 'client' && role !== 'admin') {
            killTyping();
            addMsg('bot', t('Job post checks are for client accounts. Sign in with a client account to check a job post.',
                'Job post check client account के लिए है. Job post check करने के लिए client account से sign in कीजिए.'));
            setChips(['profileAudit', 'dashboard', 'human']);
            return;
        }
        if (!window.GahonshDB || !window.GahonshDB.Jobs || !window.GahonshDB.Jobs.getMyJobs) {
            killTyping();
            addMsg('bot', t('The job service is not available right now. Open your portal and try again.',
                'Job service अभी उपलब्ध नहीं है. Portal खोलकर फिर कोशिश कीजिए.'));
            setChips(['dashboard', 'human']);
            return;
        }
        var jobs = [];
        var loadError = null;
        try {
            jobs = (await window.GahonshDB.Jobs.getMyJobs()) || [];
        } catch (e) {
            loadError = e;
            jobs = [];
        }
        if (epoch !== chatEpoch) { killTyping(); return; }
        jobs = Array.isArray(jobs) ? jobs.filter(function (job) { return job && job.id; }) : [];
        killTyping();
        if (loadError) {
            addMsg('bot', t('I could not load your job posts: ' + escapeHtml(loadError.message || 'unknown error') +
                '<br><br>Please try again, or open your portal.',
                'आपकी job posts load नहीं हो सकीं: ' + escapeHtml(loadError.message || 'unknown error') +
                '<br><br>फिर कोशिश कीजिए, या portal खोलिए.'));
            setChips(['dashboard', 'human']);
            return;
        }
        if (!jobs.length) {
            addMsg('bot', t('You have not posted a job yet. I can post one with you now, then check it.',
                'आपने अभी कोई job post नहीं की है. मैं अभी आपके साथ post कर सकता हूँ, फिर check करूँगा.'));
            setChips(['postJobBot', 'human']);
            return;
        }
        if (jobs.length === 1) {
            showJobAudit(jobs[0]);
            return;
        }
        jobPicker = jobs;
        var list = jobPicker.slice(0, 8).map(function (job, index) {
            return (index + 1) + '. ' + escapeHtml(job.title) + ' — ' + escapeHtml(job.status || 'open');
        }).join('<br>');
        var more = jobPicker.length > 8
            ? '<br><br>' + t('Showing the first 8. Paste a job link to check any other job.',
                'पहली 8 दिख रही हैं. कोई भी दूसरी job check करने के लिए job link paste कीजिए.')
            : '';
        addMsg('bot', t('Which job should I check?<br><br>' + list + more + '<br><br>Type a number, a title, or paste a job link.',
            'कौन सी job check करूँ?<br><br>' + list + more + '<br><br>Number, title या job link लिखिए.'));
        setChips(['cancelTask', 'human']);
    }

    function handleJobPicker(text) {
        var clean = String(text || '').trim();
        if (/^(cancel|stop|रद्द|band)\b/i.test(clean)) {
            jobPicker = null;
            addMsg('bot', t('Cancelled.', 'रद्द कर दिया.'));
            setChips();
            return;
        }
        var chosen = null;
        var num = parseInt(clean, 10);
        if (/^\d+[.)]?$/.test(clean) && num >= 1 && num <= jobPicker.length) {
            chosen = jobPicker[num - 1];
        } else {
            var id = extractJobId(clean);
            if (id) {
                chosen = jobPicker.filter(function (job) {
                    return String(job.id).toLowerCase() === id.toLowerCase();
                })[0] || null;
            }
            if (!chosen && clean.length >= 3) {
                chosen = jobPicker.filter(function (job) {
                    return String(job.title || '').toLowerCase().indexOf(clean.toLowerCase()) > -1;
                })[0] || null;
            }
        }
        if (!chosen) {
            addMsg('bot', t('Please type a number from the list, a title, or one of your job links.',
                'सूची में से number, title या अपनी job का link लिखिए.'));
            return;
        }
        jobPicker = null;
        showJobAudit(chosen);
    }

    async function startProfileFix() {
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        if (!user) {
            killTyping();
            pendingTask = 'profileFix';
            promptSignIn();
            return;
        }
        var profile = await fetchMyProfile(user);
        if (epoch !== chatEpoch) { killTyping(); return; }
        killTyping();
        var audit = auditProfile(profile);
        var keys = audit.items.filter(function (item) {
            return item.status !== 'ok' && item.fixable;
        }).map(function (item) { return item.key; });
        if (!keys.length) {
            if (audit.items.some(function (item) { return item.key === 'resume' && item.status !== 'ok'; })) {
                addMsg('bot', t('Everything else is filled in. The only gap is the resume PDF. Tap *Upload resume* to add it.',
                    'बाकी सब भरा हुआ है. सिर्फ resume PDF की कमी है. *Upload resume* दबाइए.'));
                setChips(['uploadResume', 'dashboard', 'human']);
            } else {
                addMsg('bot', t('Your profile is complete. Nothing to fix right now.',
                    'आपकी profile पूरी है. अभी कुछ ठीक करने को नहीं है.'));
                setChips(['findWork', 'dashboard', 'human']);
            }
            return;
        }
        var steps = profileSteps(profile).filter(function (step) { return keys.indexOf(step.key) > -1; });
        task = { type: 'profile', mode: 'fix', index: 0, steps: steps, data: {} };
        steps.forEach(function (step) {
            if (step.default !== undefined) task.data[step.key] = step.default;
        });
        addMsg('bot', t('I will ask only the gaps. Tap Skip to keep a current value.',
            'मैं सिर्फ कमियाँ पूछूँगा. मौजूदा value रखने के लिए Skip दबाइए.'));
        askTaskStep();
    }

    async function startJobFix() {
        if (!lastJobAudit || !lastJobAudit.job) {
            await startJobAudit();
            return;
        }
        var job = lastJobAudit.job;
        var audit = auditJob(job);
        var keys = audit.items.filter(function (item) { return item.status !== 'ok'; })
            .map(function (item) { return item.key; });
        if (!keys.length) {
            addMsg('bot', t('This job post already looks complete. Nothing to fix right now.',
                'यह job post पहले से पूरी लग रही है. अभी कुछ ठीक करने को नहीं है.'));
            setChips(['postJobBot', 'hireTalent', 'dashboard', 'human']);
            return;
        }
        var steps = jobSteps(job).filter(function (step) { return keys.indexOf(step.key) > -1; });
        task = { type: 'job', mode: 'fix', target: job, index: 0, steps: steps, data: {} };
        task.data.job_type = job.job_type || 'fixed';
        steps.forEach(function (step) {
            if (step.default !== undefined) task.data[step.key] = step.default;
        });
        addMsg('bot', t('I will ask only the gaps. Tap Skip to keep a current value.',
            'मैं सिर्फ कमियाँ पूछूँगा. मौजूदा value रखने के लिए Skip दबाइए.'));
        askTaskStep();
    }

    async function greetUser() {
        if (!window.GahonshDB) return;
        var epoch = chatEpoch;
        var user = null;
        try { user = await ensureUser(); } catch (e) { return; }
        if (epoch !== chatEpoch) return;
        if (!user) return;
        if (greetedUserId === user.id) return;
        greetedUserId = user.id;
        var profile = await fetchMyProfile(user);
        if (epoch !== chatEpoch) return;
        var audit = auditProfile(profile);
        var role = profile.role === 'client' ? 'client' : profile.role === 'admin' ? 'admin' : 'worker';
        var roleLabelEn = role === 'admin' ? 'an admin' : 'a ' + role;
        var name = String(profile.full_name || '').trim().split(' ')[0] || t('there', 'दोस्त');
        var top = audit.items.filter(function (item) { return item.status !== 'ok'; }).slice(0, 2)
            .map(function (item) {
                return '• ' + escapeHtml(t(item.label_en, item.label_hi)) + ': ' +
                    escapeHtml(t(item.detail_en, item.detail_hi));
            }).join('<br>');
        addMsg('bot', t(
            'Welcome back, ' + escapeHtml(name) + '. You are signed in as ' + roleLabelEn + '. Your profile is <b>' + audit.score + '/100</b>.<br><br>' + (top || 'Everything important is filled in.'),
            'वापसी पर स्वागत, ' + escapeHtml(name) + '. आप ' + role + ' के रूप में signed in हैं. आपकी profile <b>' + audit.score + '/100</b> है.<br><br>' + (top || 'ज़रूरी चीज़ें भरी हुई हैं.')
        ));
        if (!task && !jobPicker && !pendingTask && flow.step === 'idle') {
            if (role === 'client') {
                setChips(['profileAudit', 'jobAudit', 'postJobBot', 'botHelp']);
            } else if (role === 'admin') {
                setChips(['profileAudit', 'jobAudit', 'postJobBot', 'uploadResume', 'botHelp']);
            } else {
                setChips(['profileAudit', 'uploadResume', 'proposalBot', 'findWork', 'botHelp']);
            }
        }
    }

    async function ensureUser() {
        try {
            if (window.GahonshAuthUI && window.GahonshAuthUI.ensureCurrentUser) {
                return await window.GahonshAuthUI.ensureCurrentUser();
            }
            if (window.GahonshDB && window.GahonshDB.Auth && window.GahonshDB.Auth.getCurrentUser) {
                return await window.GahonshDB.Auth.getCurrentUser();
            }
        } catch (e) { /* treat as signed out */ }
        return null;
    }

    function profileSteps(profile) {
        var freelancer = profile.role === 'freelancer' || profile.role === 'admin';
        var steps = [
            {
                key: 'full_name', label_en: 'Full name', label_hi: 'पूरा नाम',
                prompt_en: 'What is your full name?',
                prompt_hi: 'आपका पूरा नाम क्या है?',
                default: profile.full_name || '',
                parse: function (v) {
                    if (v.length < 2) return { error: t('Please enter at least 2 characters.', 'कम से कम 2 अक्षर लिखिए.') };
                    return { value: v.slice(0, 80) };
                }
            },
            {
                key: 'title', label_en: 'Professional title', label_hi: 'Professional title',
                prompt_en: 'What is your professional title? Example: "Excel Automation Expert" or "Full-Stack Developer".',
                prompt_hi: 'आपका professional title क्या है? जैसे: "Excel Automation Expert" या "Full-Stack Developer".',
                default: profile.title || '',
                parse: function (v) {
                    if (v.length < 3) return { error: t('Please enter at least 3 characters.', 'कम से कम 3 अक्षर लिखिए.') };
                    return { value: v.slice(0, 120) };
                }
            },
            {
                key: 'location', label_en: 'Location', label_hi: 'Location',
                prompt_en: 'Where are you based? Example: "Ranchi, India" or "Remote". Tap Skip to leave it blank.',
                prompt_hi: 'आप कहाँ से हैं? जैसे: "Ranchi, India" या "Remote". खाली छोड़ने के लिए Skip दबाएँ.',
                optional: true,
                default: profile.location || '',
                parse: function (v) { return { value: v.slice(0, 80) }; }
            }
        ];
        if (freelancer) {
            steps.push({
                key: 'skills', label_en: 'Skills', label_hi: 'Skills',
                prompt_en: 'List your skills, separated by commas. Example: Excel VBA, Python, React.',
                prompt_hi: 'अपनी skills comma से अलग लिखिए. जैसे: Excel VBA, Python, React.',
                default: Array.isArray(profile.skills) ? profile.skills.slice() : [],
                parse: function (v) {
                    var arr = parseSkillList(v);
                    if (!arr.length) return { error: t('Please enter at least one skill.', 'कम से कम एक skill लिखिए.') };
                    return { value: arr };
                }
            });
            steps.push({
                key: 'hourly_rate', label_en: 'Hourly rate (USD)', label_hi: 'Hourly rate (USD)',
                prompt_en: 'What is your hourly rate in USD? Example: 25. Tap Skip to keep the current rate.',
                prompt_hi: 'आपकी hourly rate USD में क्या है? जैसे: 25. मौजूदा rate रखने के लिए Skip दबाएँ.',
                default: profile.hourly_rate || '',
                parse: function (v) {
                    var n = parseNumber(v);
                    if (!isFinite(n) || n <= 0 || n > 1000) {
                        return { error: t('Please enter a number between 1 and 1000.', '1 से 1000 के बीच संख्या लिखिए.') };
                    }
                    return { value: Math.round(n * 100) / 100 };
                }
            });
        }
        steps.push({
            key: 'bio', label_en: 'Bio', label_hi: 'Bio',
            prompt_en: 'Write a short bio (at least 15 characters): what you do and what you have delivered. Tap Skip to leave it unchanged.',
            prompt_hi: 'छोटा bio लिखिए (कम से कम 15 अक्षर): आप क्या करते हैं और क्या deliver किया है. बदलना न हो तो Skip दबाएँ.',
            optional: true,
            default: profile.bio || '',
            parse: function (v) {
                if (v.length < 15) return { error: t('Please write at least 15 characters.', 'कम से कम 15 अक्षर लिखिए.') };
                return { value: v.slice(0, 1200) };
            }
        });
        return steps;
    }

    function jobSteps(job) {
        var current = job || {};
        var currentBudget;
        if (current.job_type === 'hourly') {
            var hMin = Number(current.hourly_rate_min);
            var hMax = Number(current.hourly_rate_max);
            currentBudget = hMin > 0 && hMax >= hMin ? { min: hMin, max: hMax } : undefined;
        } else {
            var fixedBudget = Number(current.budget_min);
            currentBudget = fixedBudget >= 20 ? { fixed: fixedBudget } : undefined;
        }
        return [
            {
                key: 'title', label_en: 'Project title', label_hi: 'Project title',
                default: current.title || '',
                prompt_en: 'What is the project title? Example: "Automated Excel financial dashboard".',
                prompt_hi: 'Project का title क्या है? जैसे: "Automated Excel financial dashboard".',
                parse: function (v) {
                    if (v.length < 10) return { error: t('Please use at least 10 characters.', 'कम से कम 10 अक्षर लिखिए.') };
                    return { value: v.slice(0, 120) };
                }
            },
            {
                key: 'category', label_en: 'Category', label_hi: 'Category',
                default: current.category || '',
                prompt_en: 'Choose a category by number, or type its name:<br>' + choiceList(JOB_CATEGORIES),
                prompt_hi: 'Category number चुनिए, या नाम लिखिए:<br>' + choiceList(JOB_CATEGORIES),
                parse: function (v) {
                    var r = parseChoice(v, JOB_CATEGORIES);
                    if (r.error) return { error: t('Please choose 1-6 or type a category name.', '1-6 में से चुनिए या category का नाम लिखिए.') };
                    return { value: r.value };
                }
            },
            {
                key: 'description', label_en: 'Scope', label_hi: 'Scope',
                default: current.description || '',
                prompt_en: 'Describe the work in a few lines. What must be delivered, and which tools or skills matter? (At least 30 characters.)',
                prompt_hi: 'काम कुछ लाइनों में बताइए. क्या deliver करना है, और कौन सी tools/skills ज़रूरी हैं? (कम से कम 30 अक्षर.)',
                parse: function (v) {
                    if (v.length < 30) return { error: t('Please write at least 30 characters.', 'कम से कम 30 अक्षर लिखिए.') };
                    return { value: v.slice(0, 2000) };
                }
            },
            {
                key: 'job_type', label_en: 'Pricing model', label_hi: 'Pricing model',
                default: current.job_type || '',
                prompt_en: 'How should it be priced?<br>' + choiceList(JOB_TYPES),
                prompt_hi: 'कीमत कैसे तय हो?<br>' + choiceList(JOB_TYPES),
                parse: function (v) {
                    var r = parseChoice(v, JOB_TYPES);
                    if (r.error) return { error: t('Please choose 1 or 2.', '1 या 2 चुनिए.') };
                    return { value: r.value };
                }
            },
            {
                key: 'budget', label_en: 'Budget', label_hi: 'Budget',
                default: job ? currentBudget : undefined,
                prompt_en: function () {
                    return task.data.job_type === 'hourly'
                        ? 'What is your hourly range in USD? Example: 25-60 (minimum $5).'
                        : 'What is the total fixed budget in USD? Minimum $20. Example: 500.';
                },
                prompt_hi: function () {
                    return task.data.job_type === 'hourly'
                        ? 'आपकी hourly range USD में क्या है? जैसे: 25-60 (कम से कम $5).'
                        : 'कुल fixed budget USD में क्या है? कम से कम $20. जैसे: 500.';
                },
                parse: function (v) {
                    if (task.data.job_type === 'hourly') {
                        var parts = String(v).match(/\d+(?:\.\d+)?/g) || [];
                        if (parts.length < 2) {
                            return { error: t('Please write a range like 25-60.', '25-60 जैसी range लिखिए.') };
                        }
                        var lo = Number(parts[0]);
                        var hi = Number(parts[1]);
                        if (!isFinite(lo) || !isFinite(hi) || lo < 5 || hi < lo || hi > 500) {
                            return { error: t('Use a range from $5 to $500, with the maximum at least the minimum.', '$5 से $500 के बीच range लिखिए, maximum minimum से कम न हो.') };
                        }
                        return { value: { min: Math.round(lo), max: Math.round(hi) } };
                    }
                    var n = parseNumber(v);
                    if (!isFinite(n) || n < 20 || n > 1000000) {
                        return { error: t('Please enter a budget between $20 and $1,000,000.', '$20 से $1,000,000 के बीच budget लिखिए.') };
                    }
                    return { value: { fixed: Math.round(n) } };
                }
            },
            {
                key: 'duration', label_en: 'Duration', label_hi: 'Duration',
                default: current.estimated_duration || '',
                prompt_en: 'How long will it take?<br>' + choiceList(JOB_DURATIONS),
                prompt_hi: 'काम में कितना समय लगेगा?<br>' + choiceList(JOB_DURATIONS),
                parse: function (v) {
                    var r = parseChoice(v, JOB_DURATIONS);
                    if (r.error) return { error: t('Please choose 1-4.', '1-4 में से चुनिए.') };
                    return { value: r.value };
                }
            },
            {
                key: 'experience', label_en: 'Experience level', label_hi: 'Experience level',
                default: current.experience_level || '',
                prompt_en: 'Which experience level do you need?<br>' + choiceList(JOB_LEVELS),
                prompt_hi: 'किस experience level की ज़रूरत है?<br>' + choiceList(JOB_LEVELS),
                parse: function (v) {
                    var r = parseChoice(v, JOB_LEVELS);
                    if (r.error) return { error: t('Please choose 1-3.', '1-3 में से चुनिए.') };
                    return { value: r.value };
                }
            },
            {
                key: 'skills', label_en: 'Required skills', label_hi: 'Required skills',
                default: job && Array.isArray(current.required_skills) ? current.required_skills.slice() : [],
                prompt_en: 'Which skills are required? Separate them with commas, or tap Skip. Example: Excel VBA, Financial Modeling.',
                prompt_hi: 'कौन सी skills चाहिए? Comma से अलग लिखिए, या Skip दबाएँ. जैसे: Excel VBA, Financial Modeling.',
                optional: true,
                emptyValue: [],
                parse: function (v) { return { value: parseSkillList(v) }; }
            }
        ];
    }

    function proposalSteps() {
        return [
            {
                key: 'job', label_en: 'Job', label_hi: 'Job',
                prompt_en: 'Paste the job link or job ID you want to apply to. You can copy it from the job page.',
                prompt_hi: 'जिस job पर apply करना है, उसका link या job ID paste कीजिए. Job page से copy कर सकते हैं.',
                parse: async function (v) {
                    var raw = extractJobId(v);
                    if (!raw) {
                        return { error: t('That does not look like a job link or ID. Open the job page and copy the full link.', 'ये job link या ID नहीं लग रहा. Job page खोलकर पूरा link copy कीजिए.') };
                    }
                    var job = null;
                    try { job = await window.GahonshDB.Jobs.getJobById(raw); } catch (e) { job = null; }
                    if (!job) return { error: t('I could not find that job. Please check the link and try again.', 'वो job नहीं मिला. Link जाँचकर फिर कोशिश कीजिए.') };
                    if (job.status && job.status !== 'open') {
                        return { error: t('That job is not open for proposals right now.', 'वो job अभी proposals के लिए open नहीं है.') };
                    }
                    return { value: { id: job.id, title: job.title } };
                }
            },
            {
                key: 'bid', label_en: 'Your bid (USD)', label_hi: 'आपका bid (USD)',
                prompt_en: 'What is your bid in USD? Example: 250.',
                prompt_hi: 'आपका bid USD में क्या है? जैसे: 250.',
                parse: function (v) {
                    var n = parseNumber(v);
                    if (!isFinite(n) || n <= 0 || n > 1000000) {
                        return { error: t('Please enter a bid between $1 and $1,000,000.', '$1 से $1,000,000 के बीच bid लिखिए.') };
                    }
                    return { value: Math.round(n * 100) / 100 };
                }
            },
            {
                key: 'days', label_en: 'Delivery days', label_hi: 'Delivery days',
                prompt_en: 'How many days will you need? Example: 7.',
                prompt_hi: 'आपको कितने दिन लगेंगे? जैसे: 7.',
                parse: function (v) {
                    var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
                    if (!isFinite(n) || n < 1 || n > 365) {
                        return { error: t('Please enter a number of days between 1 and 365.', '1 से 365 के बीच दिन लिखिए.') };
                    }
                    return { value: n };
                }
            },
            {
                key: 'cover', label_en: 'Cover letter', label_hi: 'Cover letter',
                prompt_en: 'Write a short cover letter (at least 20 characters): why you are the right fit and how you will deliver it.',
                prompt_hi: 'छोटा cover letter लिखिए (कम से कम 20 अक्षर): आप सही क्यों हैं और कैसे deliver करेंगे.',
                parse: function (v) {
                    if (v.length < 20) return { error: t('Please write at least 20 characters.', 'कम से कम 20 अक्षर लिखिए.') };
                    return { value: v.slice(0, 2000) };
                }
            }
        ];
    }

    function askTaskStep() {
        if (!task) return;
        if (task.index >= task.steps.length) {
            renderTaskSummary();
            return;
        }
        var step = task.steps[task.index];
        var current = task.data[step.key] !== undefined ? task.data[step.key] : step.default;
        var hasCurrent = current !== undefined && current !== null && String(current).trim() !== '';
        var promptEn = typeof step.prompt_en === 'function' ? step.prompt_en() : step.prompt_en;
        var promptHi = typeof step.prompt_hi === 'function' ? step.prompt_hi() : step.prompt_hi;
        var hint = hasCurrent
            ? t(' Current: ' + escapeHtml(displayTaskValue(current)) + ' — type a new value or tap Skip to keep it.',
                ' अभी: ' + escapeHtml(displayTaskValue(current)) + ' — नया लिखिए या Skip दबाएँ.')
            : '';
        var progress = t('Step ' + (task.index + 1) + ' of ' + task.steps.length + ' — ',
            'Step ' + (task.index + 1) + ' / ' + task.steps.length + ' — ');
        addMsg('bot', '<span class="gc-step">' + progress + '</span>' + t(promptEn, promptHi) + hint);
        setChips(step.optional || hasCurrent ? ['skipTask', 'cancelTask'] : ['cancelTask']);
    }

    function nextTaskStep() {
        task.index += 1;
        askTaskStep();
    }

    function renderTaskSummary() {
        task.index = task.steps.length;
        var rows = task.steps.map(function (step) {
            var value = task.data[step.key];
            return '<b>' + escapeHtml(t(step.label_en, step.label_hi)) + ':</b> ' + escapeHtml(displayTaskValue(value));
        });
        addMsg('bot', t('Please review:', 'नीचे देख लीजिए:') +
            '<div class="gc-summary">' + rows.join('<br>') + '</div>' +
            t('<br>Type *yes* to save or post, *edit* to change, or *cancel*.',
                '<br>सेव/पोस्ट करने के लिए *yes* लिखिए, बदलने के लिए *edit*, या *cancel*.'));
        setChips(['confirmTask', 'editTask', 'cancelTask']);
    }

    function cancelTask() {
        task = null;
        pendingTask = null;
        jobPicker = null;
        addMsg('bot', t('Cancelled. Nothing was saved. What else can I do?', 'रद्द कर दिया. कुछ सेव नहीं हुआ. और क्या कर सकता हूँ?'));
        setChips();
    }

    async function handleTaskInput(text) {
        if (!task || task.busy) return;
        var currentTask = task;
        var clean = String(text).trim();
        if (/^(cancel|stop|रद्द|band|बंद)\b/i.test(clean)) {
            cancelTask();
            return;
        }
        if (task.index >= task.steps.length) {
            handleTaskConfirm(clean);
            return;
        }
        var step = task.steps[task.index];
        if (/^(skip|छोड़ें|chhod|chhod do)\b/i.test(clean)) {
            var current = task.data[step.key] !== undefined ? task.data[step.key] : step.default;
            if (current === undefined || current === null || String(current).trim() === '') {
                if (step.optional) {
                    task.data[step.key] = step.emptyValue !== undefined ? step.emptyValue : '';
                    nextTaskStep();
                    return;
                }
                addMsg('bot', t('This one is required, please answer it.', 'ये ज़रूरी है, कृपया जवाब दीजिए.'));
                return;
            }
            task.data[step.key] = current;
            nextTaskStep();
            return;
        }
        task.busy = true;
        var result;
        try {
            result = await step.parse(clean);
        } catch (err) {
            if (task !== currentTask) return;
            task.busy = false;
            addMsg('bot', t('Something went wrong while checking that. Please try again.',
                'जाँच में कुछ गड़बड़ हुई. फिर कोशिश कीजिए.'));
            return;
        }
        if (task !== currentTask) return;
        task.busy = false;
        if (!result || typeof result !== 'object') {
            addMsg('bot', t('Something went wrong while checking that. Please try again.',
                'जाँच में कुछ गड़बड़ हुई. फिर कोशिश कीजिए.'));
            return;
        }
        if (result.error) {
            addMsg('bot', result.error);
            return;
        }
        task.data[step.key] = result.value;
        nextTaskStep();
    }

    function handleTaskConfirm(text) {
        if (/^(yes|y|confirm|post|save|submit|ok|okay|हाँ|हां|ठीक|पक्का|करो|कर दो)\b/i.test(text)) {
            submitTask();
            return;
        }
        if (/^(edit|change|बदलें|badal)\b/i.test(text)) {
            task.index = 0;
            askTaskStep();
            return;
        }
        if (/^(cancel|stop|रद्द|band)\b/i.test(text)) {
            cancelTask();
            return;
        }
        addMsg('bot', t('Please type *yes* to confirm, *edit* to change, or *cancel*.',
            '*yes* लिखिए पक्का करने के लिए, *edit* बदलने के लिए, या *cancel*.'));
    }

    async function submitTask() {
        if (!task || task.busy) return;
        var current = task;
        var epoch = chatEpoch;
        task.busy = true;
        addTyping();
        var success = false;
        try {
            if (task.type === 'profile') {
                var updates = {};
                ['full_name', 'title', 'location', 'skills', 'hourly_rate', 'bio'].forEach(function (key) {
                    if (task.data[key] !== undefined) updates[key] = task.data[key];
                });
                var saved = await window.GahonshDB.Profiles.updateMyProfile(updates);
                if (task !== current || epoch !== chatEpoch) return;
                success = true;
                killTyping();
                var shownTitle = saved.title || task.data.title || '';
                var titleLineEn = shownTitle ? ' Your public profile now shows <b>' + escapeHtml(shownTitle) + '</b>.' : '';
                var titleLineHi = shownTitle ? ' आपके public profile पर अब <b>' + escapeHtml(shownTitle) + '</b> दिखेगा.' : '';
                addMsg('bot', t('Profile saved.' + titleLineEn + '<br><br>' +
                    a(BASE + 'find-talent.html', 'See the talent directory') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'Open your portal') + '<br><br>Here is the updated check:',
                    'Profile सेव हो गया.' + titleLineHi + '<br><br>' +
                    a(BASE + 'find-talent.html', 'Talent directory देखें') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'Portal खोलें') + '<br><br>अब यह updated check है:'));
                showProfileAudit(saved);
            } else if (task.type === 'job') {
                var jobType = task.data.job_type || (task.target && task.target.job_type) || 'fixed';
                var payload = {};
                if (task.data.title !== undefined) payload.title = task.data.title;
                if (task.data.category !== undefined) payload.category = task.data.category;
                if (task.data.description !== undefined) payload.description = task.data.description;
                if (task.data.duration !== undefined) payload.estimated_duration = task.data.duration;
                if (task.data.experience !== undefined) payload.experience_level = task.data.experience;
                if (task.data.skills !== undefined) payload.required_skills = task.data.skills;
                if (task.data.job_type !== undefined) payload.job_type = task.data.job_type;
                if (task.data.budget !== undefined) {
                    payload.budget_min = jobType === 'fixed' ? task.data.budget.fixed : 0;
                    payload.hourly_rate_min = jobType === 'hourly' ? task.data.budget.min : null;
                    payload.hourly_rate_max = jobType === 'hourly' ? task.data.budget.max : null;
                }
                var isFix = task.mode === 'fix' && !!task.target;
                var job = isFix
                    ? await window.GahonshDB.Jobs.updateJob(task.target.id, payload)
                    : await window.GahonshDB.Jobs.createJob(payload);
                if (task !== current || epoch !== chatEpoch) return;
                success = true;
                killTyping();
                var jobUrl = BASE + 'job-details.html?id=' + encodeURIComponent(job.id);
                addMsg('bot', t((isFix ? 'Job updated.' : 'Job posted.') + ' <b>' + escapeHtml(job.title) + '</b> ' +
                    (isFix ? 'now shows the changes.' : 'is now open for proposals.') + '<br><br>' +
                    a(jobUrl, 'Open your job') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'See proposals in your portal') + '<br><br>Here is the updated check:',
                    (isFix ? 'Job update हो गया.' : 'Job post हो गया.') + ' <b>' + escapeHtml(job.title) + '</b> ' +
                    (isFix ? 'अब बदलाव दिख रहे हैं.' : 'अब proposals के लिए open है.') + '<br><br>' +
                    a(jobUrl, 'अपना job खोलें') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'Portal में proposals देखें') + '<br><br>अब यह updated check है:'));
                showJobAudit(job);
            } else if (task.type === 'proposal') {
                await window.GahonshDB.Proposals.submitProposal(
                    task.data.job.id, task.data.cover, task.data.bid, task.data.days
                );
                if (task !== current || epoch !== chatEpoch) return;
                success = true;
                killTyping();
                var proposalUrl = BASE + 'job-details.html?id=' + encodeURIComponent(task.data.job.id);
                addMsg('bot', t('Proposal sent for <b>' + escapeHtml(task.data.job.title) + '</b>. The client can now review your bid.<br><br>' +
                    a(proposalUrl, 'View the job') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'Track it in your portal'),
                    '<b>' + escapeHtml(task.data.job.title) + '</b> के लिए proposal भेज दिया. अब client आपका bid देख सकता है.<br><br>' +
                    a(proposalUrl, 'Job देखें') + ' &middot; ' +
                    a(BASE + 'marketplace-dashboard.html', 'Portal में track करें')));
                setChips(['findWork', 'dashboard', 'human']);
            }
        } catch (err) {
            if (task !== current || epoch !== chatEpoch) return;
            killTyping();
            addMsg('bot', t('Could not save that: ' + escapeHtml(err.message || 'unknown error') + '<br><br>You can try again, or use the page form.',
                'सेव नहीं हो सका: ' + escapeHtml(err.message || 'unknown error') + '<br><br>फिर कोशिश कीजिए, या page form इस्तेमाल कीजिए.'));
            setChips(['confirmTask', 'cancelTask']);
        } finally {
            if (task === current) {
                task.busy = false;
                if (success) task = null;
            }
        }
    }

    function promptSignIn() {
        addMsg('bot', t('Please sign in first. I need your account to read or save this for you.<br><br>Tap *Sign in*, then *Continue*.',
            'पहले sign in कीजिए. यह पढ़ने या सेव करने के लिए आपका account चाहिए.<br><br>*Sign in* दबाइए, फिर *Continue*.'));
        setChips(['signIn', 'continueTask', 'cancelTask']);
    }

    function handleSignIn() {
        if (window.GahonshAuthUI && window.GahonshAuthUI.openAuthModal) {
            window.GahonshAuthUI.openAuthModal('signin');
        } else {
            window.location.href = BASE + 'marketplace-dashboard.html';
            return;
        }
        addMsg('bot', t('Sign in in the window that opened, then tap *Continue*.', 'खुली window में sign in कीजिए, फिर *Continue* दबाइए.'));
        setChips(['continueTask', 'cancelTask']);
    }

    async function handleContinue() {
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        killTyping();
        if (!user) {
            addMsg('bot', t('I still do not see a signed-in account. Please sign in first.', 'अभी भी sign-in नहीं दिख रहा. पहले sign in कीजिए.'));
            setChips(['signIn', 'continueTask', 'cancelTask']);
            return;
        }
        var next = pendingTask;
        pendingTask = null;
        if (next) startTask(next);
    }

    async function startResumeUpload() {
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        killTyping();
        if (!user) {
            pendingTask = 'resume';
            promptSignIn();
            return;
        }
        var role = (user.profile && user.profile.role) || '';
        if (role !== 'freelancer' && role !== 'admin') {
            addMsg('bot', t('Resume upload is for worker profiles. Sign in with a worker account, or update your client profile instead.',
                'Resume upload worker profile के लिए है. Worker account से sign in कीजिए, या अपना client profile अपडेट कीजिए.'));
            setChips(['buildProfileBot', 'human']);
            return;
        }
        if (window.GahonshAuthUI && window.GahonshAuthUI.openProfileModal) {
            addMsg('bot', t('Opening your profile editor. Scroll to *Resume / CV (PDF)*, choose a PDF up to 5 MB, then press *Upload Resume*.',
                'आपका profile editor खोल रहा हूँ. *Resume / CV (PDF)* तक scroll कीजिए, 5 MB तक की PDF चुनिए, फिर *Upload Resume* दबाइए.'));
            try {
                await window.GahonshAuthUI.openProfileModal();
            } catch (e) { /* the modal logs its own error */ }
        } else {
            addMsg('bot', t('Open your portal and use Edit Profile to add the PDF: ' + a(BASE + 'marketplace-dashboard.html', 'Marketplace Portal'),
                'Portal खोलकर Edit Profile से PDF जोड़िए: ' + a(BASE + 'marketplace-dashboard.html', 'Marketplace Portal')));
            setChips(['dashboard', 'human']);
        }
    }

    async function startTask(type) {
        if (task && task.busy) {
            addMsg('bot', t('One moment — I am still saving the previous step.', 'एक पल — पिछला step सेव हो रहा है.'));
            return;
        }
        if (task) {
            task = null;
            addMsg('bot', t('Switching tasks. The previous one was not saved.', 'नया काम शुरू कर रहा हूँ. पिछला सेव नहीं हुआ.'));
        }
        pendingTask = null;
        jobPicker = null;
        flow = { step: 'idle', name: '', email: '', project: '' };
        if (type === 'resume') {
            await startResumeUpload();
            return;
        }
        if (type === 'profileAudit') {
            await startProfileAudit();
            return;
        }
        if (type === 'jobAudit') {
            await startJobAudit();
            return;
        }
        if (type === 'profileFix') {
            await startProfileFix();
            return;
        }
        if (type === 'jobFix') {
            await startJobFix();
            return;
        }
        var epoch = chatEpoch;
        addTyping();
        var user = await ensureUser();
        if (epoch !== chatEpoch) { killTyping(); return; }
        killTyping();
        if (!user) {
            pendingTask = type;
            promptSignIn();
            return;
        }
        var profile = user.profile || {};
        var role = profile.role || '';
        if (type === 'job' && role !== 'client' && role !== 'admin') {
            addMsg('bot', t('Job posting is for client accounts. Sign in with a client account, or switch your role in the portal.',
                'Job post करना client account के लिए है. Client account से sign in कीजिए, या portal में role बदलिए.'));
            setChips(['dashboard', 'human']);
            return;
        }
        if (type === 'proposal' && role !== 'freelancer' && role !== 'admin') {
            addMsg('bot', t('Proposals are for worker accounts. Sign in with a worker account to apply.',
                'Proposal worker account के लिए है. Apply करने के लिए worker account से sign in कीजिए.'));
            setChips(['dashboard', 'human']);
            return;
        }
        var steps = type === 'profile' ? profileSteps(profile)
            : type === 'job' ? jobSteps()
            : type === 'proposal' ? proposalSteps()
            : null;
        if (!steps) return;
        task = { type: type, index: 0, steps: steps, data: {} };
        addMsg('bot', t('Let us do it together. I will ask a few questions, then you confirm and I save it. Type *cancel* anytime.',
            'चलिए साथ में करते हैं. मैं कुछ सवाल पूछूँगा, फिर आप confirm करेंगे और मैं सेव कर दूँगा. कभी भी *cancel* लिख सकते हैं.'));
        askTaskStep();
    }

    var ACTION_HANDLERS = {
        postJobBot: function () { startTask('job'); },
        buildProfileBot: function () { startTask('profile'); },
        proposalBot: function () { startTask('proposal'); },
        uploadResume: function () { startTask('resume'); },
        profileAudit: function () { startTask('profileAudit'); },
        jobAudit: function () { startTask('jobAudit'); },
        fixProfile: function () { startTask('profileFix'); },
        fixJob: function () { startTask('jobFix'); },
        dashboard: function () {
            addTyping();
            setTimeout(function () {
                killTyping();
                addMsg('bot', t('Your portal holds your profile, jobs, proposals and contracts:<br><br>' +
                    a(BASE + 'marketplace-dashboard.html', 'Open Marketplace Portal'),
                    'आपके portal में profile, jobs, proposals और contracts हैं:<br><br>' +
                    a(BASE + 'marketplace-dashboard.html', 'Marketplace Portal खोलें')));
                setChips(['profileAudit', 'buildProfileBot', 'postJobBot', 'uploadResume', 'human']);
            }, 300);
        },
        signIn: handleSignIn,
        continueTask: handleContinue,
        cancelTask: cancelTask,
        skipTask: function () { handleTaskInput('skip'); },
        confirmTask: function () { handleTaskInput('yes'); },
        editTask: function () { handleTaskInput('edit'); }
    };

    /* ---------------------------------------------------------- quote capture */
    function submitLead() {
        var cfg = window.GAHONSH_CONFIG || {};
        var url = cfg.SUPABASE_URL || 'https://evdpmombgymthzqegqwr.supabase.co';
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

        // A guided task owns the next message, so "yes", "skip" and field
        // answers are not mistaken for a new question.
        if (task) {
            handleTaskInput(clean);
            return;
        }
        if (jobPicker) {
            handleJobPicker(clean);
            return;
        }

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
        if (intent) {
            // A question often covers a service and a price or a timeline at the
            // same time. Answer the main one fully, then add one compact line for
            // the other so nothing asked is left out.
            var topService = ranked.filter(function (x) { return SERVICEISH[x.i.id]; })[0];
            var topMod = ranked.filter(function (x) { return MODIFIER[x.i.id]; })[0];
            var other = null;
            if (SERVICEISH[intent.id] && topMod && topMod.i.id !== intent.id) other = topMod.i;
            else if (MODIFIER[intent.id] && topService && topService.i.id !== intent.id) other = topService.i;
            if (other && other.b_en) extra = lang === 'hi' ? other.b_hi : other.b_en;
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
            setChips(['postJobBot', 'buildProfileBot', 'botHelp', 'services', 'pricing', 'human']);
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
                    'Hi! I am the Gahonsh assistant. I can answer questions, and I can also do tasks with you:<br><br>• *Check my profile* — score and missing details<br>• *Check my job post* — score and improvements (client)<br>• *Post a job* (client)<br>• *Build or update your profile* (worker or client)<br>• *Upload a resume* (worker)<br>• *Submit a proposal* (worker)<br><br>Tap a button below, or just tell me what you need.',
                    'नमस्ते! मैं GAHONSH का assistant हूँ. सवालों के जवाब के साथ-साथ मैं काम भी कर सकता हूँ:<br><br>• *Profile check* — score और क्या कमी है<br>• *Job post check* — score और सुधार (client)<br>• *Job post करना* (client)<br>• *Profile बनाना/अपडेट करना* (worker या client)<br>• *Resume upload* (worker)<br>• *Proposal भेजना* (worker)<br><br>नीचे button दबाइए, या सीधे बताइए क्या चाहिए.'
                ));
                setChips(['profileAudit', 'jobAudit', 'postJobBot', 'buildProfileBot', 'uploadResume', 'botHelp']);
                greetUser().catch(function () { /* keep the greeting visible */ });
            } else {
                setChips(['profileAudit', 'jobAudit', 'postJobBot', 'buildProfileBot', 'uploadResume', 'botHelp']);
                greetUser().catch(function () { /* refresh chips for a signed-in user */ });
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

    // Profile and job audits put private details in the chat log. Clear the
    // log and its localStorage copy when the account signs out or changes, so
    // a shared browser does not show the previous user's data.
    var chatUserId = null;

    function clearPrivateChat(messageEn, messageHi) {
        chatEpoch += 1;
        task = null;
        pendingTask = null;
        jobPicker = null;
        lastProfileAudit = null;
        lastJobAudit = null;
        greetedUserId = null;
        flow = { step: 'idle', name: '', email: '', project: '' };
        history = [];
        store('gc_hist', '[]');
        log.innerHTML = '';
        addMsg('bot', t(messageEn, messageHi));
        setChips();
    }

    function watchPrivateChatAuth() {
        if (!window.GahonshDB || !window.GahonshDB.Auth) return;
        var auth = window.GahonshDB.Auth;
        if (typeof auth.getCurrentUser === 'function') {
            try {
                Promise.resolve(auth.getCurrentUser()).then(function (user) {
                    if (user && user.id) chatUserId = user.id;
                }).catch(function () {});
            } catch (e) { /* auth state is optional */ }
        }
        if (typeof auth.onAuthStateChange !== 'function') return;
        try {
            var sub = auth.onAuthStateChange(function (event, sessionOrUser, maybeUser) {
                var user = maybeUser || (sessionOrUser && sessionOrUser.user) || sessionOrUser || null;
                var userId = user && user.id ? user.id : null;
                if (event === 'SIGNED_OUT') {
                    // A guest has no private chat to clear. Only clear when a
                    // signed-in user was active in this tab.
                    if (!chatUserId) return;
                    chatUserId = null;
                    clearPrivateChat(
                        'You are signed out. The previous chat was cleared. Ask me anything, or sign in to check your profile.',
                        'आप sign out हैं. पिछली chat clear कर दी गई. कुछ भी पूछिए, या profile check करने के लिए sign in कीजिए.'
                    );
                    return;
                }
                if (event === 'SIGNED_IN' && chatUserId && userId && chatUserId !== userId) {
                    clearPrivateChat(
                        'Signed in with a different account. The previous chat was cleared.',
                        'दूसरे account से sign in हुए. पिछली chat clear कर दी गई.'
                    );
                }
                if (userId) chatUserId = userId;
                // If the visitor signs in while the chat is open, refresh the
                // role-specific chips. Do not disturb a running task, a pending
                // task's Continue chip, a job picker, or a quote form.
                if (event === 'SIGNED_IN' && !task && !jobPicker && !pendingTask &&
                    flow.step === 'idle' && panel.classList.contains('open')) {
                    greetUser().catch(function () {});
                }
            });
            if (sub && typeof sub.catch === 'function') sub.catch(function () {});
        } catch (e) { /* auth state is optional */ }
    }

    watchPrivateChatAuth();

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
