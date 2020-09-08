const express = require("express");
const helmet = require("helmet");

const auditor = require("./auditor");

const app = express();
app.use(helmet());

(async () => {
    try {
        await auditor.init();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }

    app.get("/sri-audit", async (req, res) => {
        const { host, clear } = req.query;
        if (!host) return res.json({ error: "`host` query parameter is required" });
        console.log(`auditing ${host}`);

        try {
            const result = await auditor.audit(host, clear);
            res.json(result);
        } catch(e) {
            console.log(e);
            res.json({ error: e.message });
        }
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`listening on port ${PORT}`));
})();
