const { chromium } = require('playwright');
const fs = require('fs');

// Function to mask phone numbers for privacy (replace last 4 digits with ****)
function maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
    return phoneNumber.slice(0, -4) + '****';
}

// Array of cities to search
const cities = ["Toronto","Ottawa","Mississauga","Brampton","Hamilton","Markham","Vaughan","Kitchener","Windsor","Richmond Hill","Oakville","Burlington","Oshawa","St. Catharines","Cambridge","Guelph","Whitby","Ajax","Thunder Bay","Waterloo","Brantford","Pickering","Niagara Falls","Peterborough","Sarnia","Barrie","Sault Ste. Marie","Kingston","London","Timmins","Orillia","Welland","Cornwall","North Bay","Quinte West","Belleville","Brockville","Owen Sound","Stratford","Port Colborne","Dryden","Kenora","Elliot Lake"];
const maxScrolls = 10;
const scrollPause = 2000;

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();
    const data = [];

    for (const city of cities) {
        try {
            const query = `coworking spaces near ${city}`;
            await page.goto("https://www.google.com/maps");
            await page.waitForTimeout(5000);

            const searchBox = page.locator("#UGojuc");
            await searchBox.fill(query);
            await searchBox.press("Enter");
            await page.waitForTimeout(5000);

            for (let i = 0; i < maxScrolls; i++) {
                await page.evaluate(() => {
                    const el = document.querySelector('div[role="feed"]');
                    if (el) el.scrollTop = el.scrollHeight;
                });
                await page.waitForTimeout(scrollPause);
            }

            const feedContainer = page.locator('div[role="feed"]');
            const cards = feedContainer.locator('a.hfpxzc'); // card links
            const count = await cards.count();

            if (count === 0) {
                console.log(`No results found for city: ${city}`);
                continue; // Skip to next city
            }

            console.log(`Found ${count} cards in ${city}`);

            for (let i = 0; i < count; i++) {
                const card = cards.nth(i);

                let name = "";
                let address = "";
                let detailUrl = "";
                let phoneNumber = "";
                let website = "";
                let email = "";

                try {
                    // Get detail URL directly from card
                    detailUrl = await card.getAttribute("href");

                    // Click card to load detail panel
                    await card.click();
                    await page.waitForTimeout(3000);

                    // Name
                    const nameEl = page.locator('h1.DUwDvf.lfPIob');
                    if (await nameEl.count()) name = await nameEl.innerText();

                    // Address
                    const addressEl = page.locator('div.Io6YTe.fontBodyMedium.kR99db.fdkmkc');
                    if (await addressEl.count()) address = await addressEl.first().innerText();

                    // Phone & website (UPDATED LOGIC)
                    const infoEls = await page.$$('div.Io6YTe.fontBodyMedium.kR99db.fdkmkc');
                    const websites = [];

                    for (const el of infoEls) {
                        const text = (await el.innerText()).trim();

                        // Phone
                        if (!phoneNumber && /\+?\d[\d\s\-\(\)]{7,}\d/.test(text)) {
                            phoneNumber = text;
                        }

                        // Collect all domains except booking platforms
                        if (
                            text.includes('.') &&
                            !text.includes('peerspace.com')
                        ) {
                            websites.push(text);
                        }
                    }

                    // Prefer the LAST website (usually the real business site)
                    if (websites.length) {
                        const raw = websites[websites.length - 1];
                        website = raw.startsWith('http') ? raw : `https://${raw}`;
                    }

                    if (website) {
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|ca|org|net|co)\b/i;

                        /** 1️⃣ HOMEPAGE **/
                        const sitePage = await context.newPage();
                        try {
                            await sitePage.goto(website, { timeout: 15000 });
                            await sitePage.waitForTimeout(3000);

                            const html = await sitePage.content();
                            const match = html.match(emailRegex);
                            if (match) email = match[0];
                        } catch {}
                        
                        /** 2️⃣ CONTACT PAGES **/
                        if (!email) {
                            const contactPaths = ['/contact', '/pages/contact', '/contact-us'];

                            for (const path of contactPaths) {
                                try {
                                    const contactUrl = website.replace(/\/$/, '') + path;
                                    await sitePage.goto(contactUrl, { timeout: 15000 });
                                    await sitePage.waitForTimeout(3000);

                                    const html = await sitePage.content();
                                    const match = html.match(emailRegex);
                                    if (match) {
                                        email = match[0];
                                        break;
                                    }
                                } catch {}
                            }
                        }

                        /** 3️⃣ FACEBOOK FALLBACK **/
                        if (!email) {
                            try {
                                // Look for Facebook link on homepage
                                await sitePage.goto(website, { timeout: 15000 });
                                await sitePage.waitForTimeout(3000);

                                const fbLink = await sitePage
                                    .locator('a[href*="facebook.com"]')
                                    .first()
                                    .getAttribute('href');

                                if (fbLink) {
                                    const fbPage = await context.newPage();
                                    try {
                                        await fbPage.goto(fbLink, { timeout: 20000 });
                                        await fbPage.waitForTimeout(5000);

                                        const fbHtml = await fbPage.content();
                                        const match = fbHtml.match(emailRegex);
                                        if (match) email = match[0];
                                    } catch {}
                                    await fbPage.close();
                                }
                            } catch {}
                        }

                        await sitePage.close();
                    }

                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1500);

                    data.push({
                        Name: name,
                        Address: address,
                        "Detail URL": detailUrl,
                        Phone: phoneNumber,
                        Website: website,
                        Email: email
                    });

                    console.log(
                        `Processed ${i + 1}/${count}: ${name} | Address: ${address} | Phone: ${
                            phoneNumber ? maskPhoneNumber(phoneNumber) : "No phone"
                        } | Website: ${website || "No website"} | Email: ${email || "No email"}`
                    );
                } catch (e) {
                    console.log(`Error on card ${i + 1}`, e.message);
                }
            }
        } catch (e) {
            console.log(`Error searching city ${city}:`, e.message);
        }
    }

    /** CSV **/
    const csvHeader = "Name,Address,Detail URL,Phone,Website,Email\n";
    const csvRows = data
        .map(r =>
            [r.Name, r.Address, r["Detail URL"], r.Phone, r.Website, r.Email]
                .map(v => `"${(v || "").replace(/"/g, '""')}"`)
                .join(",")
        )
        .join("\n");

    fs.writeFileSync("maps_data_playwright.csv", csvHeader + csvRows, "utf8");
    console.log(`Saved ${data.length} records`);

    await browser.close();
})();
