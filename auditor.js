const puppeteer = require("puppeteer");
const { parseDomain } = require("parse-domain");
const moment = require("moment");

const {
    AUDIT_CACHE_TIME_IN_MINS = 15,
    WAIT_AFTER_PAGE_LOAD_IN_MS = 1000,
} = process.env;

const withoutIntegrity = (els, { prop, root }) => els
    .filter(({ [prop]: src }) => src && !src.startsWith("/") && !src.includes(root))
    .filter(({ integrity }) => !integrity);

const linksWithoutIntegrity = async ({ page, root }) => {
    const links = await page.$$eval(
        'link',
        els => els
            .map(e => ({ href:e.href, integrity:e.integrity, crossorigin:e.crossorigin }))
    );
    return withoutIntegrity(links, { prop: 'href', root });
}

const scriptsWithoutIntegrity = async ({ page, root }) => {
    const scripts = await page.$$eval(
        'script',
        els => els
            .map(e => ({ src:e.src, integrity:e.integrity, crossorigin:e.crossorigin }))
    );
    return withoutIntegrity(scripts, { prop: 'src', root });
}

const UNINITIALIZED = 0;
const INITIALIZING = 1;
const INITIALIZED = 2;
module.exports = (() => {
    let browser;
    let state = UNINITIALIZED;
    const audits = {};

    return {
        init: async () => {
            if (state !== UNINITIALIZED) return;

            state = INITIALIZING
            try {
                browser = await puppeteer.launch();
                state = INITIALIZED
            } catch (error) {
                throw error
            }
        },
        close: async () => browser && browser.close(),
        audit: async (host, clear = false) => {
            if (state !== INITIALIZED) throw new Error("browser not yet initialized")
            if (!/^http?s:\/\//.test(host)) throw new Error("no protocol on host");

            const { domain, topLevelDomains } = parseDomain(host.replace(/http?s:\/\//,""))
            const root = `${domain}.${topLevelDomains.join(".")}`;

            if (clear) delete audits[host];
            const prevAudit = audits[host];
            if (prevAudit && moment().diff(moment(prevAudit.timestamp), 'm') < AUDIT_CACHE_TIME_IN_MINS) {
                return audits[host];
            }

            const page = await browser.newPage();
            await page.goto(host);

            await page.waitFor(WAIT_AFTER_PAGE_LOAD_IN_MS);

            const [links, scripts] = await Promise.all([
                linksWithoutIntegrity({ page, root }),
                scriptsWithoutIntegrity({ page, root }),
            ]);

            await page.close();

            const audit = {
                scripts,
                links,
                timestamp: Date.now(),
            };
            audits[host] = audit;
            return audit;
        }
    }
})();
