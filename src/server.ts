import app from "./index.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Ngurra Flora API running on http://localhost:${PORT}`);
});
