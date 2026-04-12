export default async function handler(req, res) {
  // Allow GET for easy polling
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ODDS_API_KEY not configured" });
  }

  try {
    const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/scores/?apiKey=${apiKey}&daysFrom=1&dateFormat=iso`;
    const response = await fetch(url);

    if (!response.ok) {
      const err = await response.text();
      console.error("Odds API error:", err);
      return res.status(response.status).json({ error: "Scores API call failed" });
    }

    const data = await response.json();

    // Set cache headers -- refresh every 60 seconds
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Scores API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
