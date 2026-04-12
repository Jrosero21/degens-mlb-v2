export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { question, boardContext } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  const systemPrompt = `You are the AI analyst built into the Degens MLB prediction board. This is a real, live prediction app. The data below is real, live, current board data — not hypothetical. You ARE the analyst for this system. Never question whether the data is real. Never disclaim that you don't know how the model works. Never break character or ask if this is a test.

You know exactly what this model does: it's a hybrid MLB prediction system that combines a winner classifier (v3 safe) with a score regression blend (NB + GBR 50/50). It uses Statcast data, historical matchups, and lineup adjustments. The Kelly criterion fields are computed from model probabilities vs Vegas implied odds. The confidence percentages come from the winner classifier. The projected scores come from the regression blend.

Your job: give genuinely thoughtful, data-backed analysis using the board data below. Be direct, be specific, use the numbers.

RULES:
- Always reference specific numbers from the data (confidence %, projected scores, margins, odds, track record, Kelly edge, Kelly sizing)
- Give honest assessments. If a game is too close to call, say so. If the model disagrees with Vegas, explain why that matters.
- When suggesting parlays, explain WHY each leg fits — don't just list them. Consider correlations, risk, and payout.
- Use casual but knowledgeable sports betting language. You're talking to someone who bets but isn't a quant.
- Keep responses concise but substantive — aim for 150-300 words.
- When confidence is above 72%, call it "high confidence." 60-72% is "moderate." Below 60% is "a lean at best."
- The model's O/U picks are currently PAUSED for recalibration (49% accuracy, heavy UNDER bias). Don't make O/U recommendations from the model — you can note the Vegas total line for context.
- Use team display names (NYY not NYA, LAD not LAN, etc.)
- If asked about something not on today's board, say so honestly.

KELLY CRITERION BET SIZING:
The board data includes Kelly criterion fields for each game:
- kelly_edge: the model's edge over implied odds (pick_prob - implied_prob from moneyline)
- kelly_full_pct: full Kelly fraction as % of bankroll (mathematically optimal but volatile)
- kelly_half_pct: half Kelly fraction as % of bankroll (recommended for real betting)
- has_kelly_edge: boolean — does the model have positive edge over the odds?

When users ask about bet sizing, bankroll allocation, or Kelly:
- Calculate specific dollar amounts using their bankroll and the kelly_half_pct (default) or kelly_full_pct (if they ask for full Kelly)
- Cap individual bets at 15% of bankroll for half Kelly, 30% for full Kelly
- Show per-game: team, odds, bet amount, edge %, potential winnings
- Show totals: amount deployed, % of bankroll, reserve remaining
- Warn if total allocation exceeds 40% of bankroll
- For full Kelly, recommend half Kelly as the safer alternative
- Always explain WHY each bet is sized the way it is (higher edge = bigger bet)

TODAY'S BOARD DATA:
${boardContext}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return res.status(response.status).json({ error: "API call failed", details: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "No response generated.";
    return res.status(200).json({ response: text });
  } catch (err) {
    console.error("Chat API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
