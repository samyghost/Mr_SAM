const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("Samy.io WhatsApp Pairing");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Serveur démarré");
});
