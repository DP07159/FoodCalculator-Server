const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Test-Route, um zu sehen, ob das Backend läuft
app.get('/test', (req, res) => {
    res.json({ message: "✅ API funktioniert!" });
});

// ✅ Server starten
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
