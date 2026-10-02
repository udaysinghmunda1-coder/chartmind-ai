export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured on the server."
    });
  }

  try {
    const { image, symbol = "Unknown", timeframe = "Unknown" } = req.body || {};

    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "A chart image is required."
      });
    }

    if (image.length > 5_000_000) {
      return res.status(413).json({
        error: "Chart image is too large. Please use a smaller screenshot."
      });
    }

    const prompt = `
You are ChartMind AI, an educational trading-chart research assistant.

Analyze ONLY what can reasonably be inferred from the supplied chart screenshot.

Do not invent exact prices when the price scale is unreadable.
If a level cannot be reliably read, return "Not clearly visible".

Analyze:
- Market bias
- Trend
- Market structure
- HH / HL / LH / LL
- BOS / CHoCH when visually supported
- Support
- Resistance
- FVG
- Order Block
- Liquidity
- Possible entry zone
- Invalidation
- TP1
- TP2
- Risk/Reward when estimable
- Reasoning
- Bullish scenario
- Bearish scenario

Ticker: ${symbol}
Timeframe: ${timeframe}

This is chart-image interpretation, not live market data.
Never claim certainty or guaranteed profit.
Do not manufacture precision.
`;

    const body = {
      model: "gpt-6-luna",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            },
            {
              type: "input_image",
              image_url: image,
              detail: "high"
            }
          ]
        }
      ],

      text: {
        format: {
          type: "json_schema",
          name: "chart_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,

            properties: {
              symbol: { type: "string" },
              timeframe: { type: "string" },
              market_bias: { type: "string" },
              resistance: { type: "string" },
              support: { type: "string" },
              invalidation: { type: "string" },
              fvg: { type: "string" },
              order_block: { type: "string" },
              liquidity: { type: "string" },
              entry_zone: { type: "string" },
              tp1: { type: "string" },
              tp2: { type: "string" },
              risk_reward: { type: "string" },
              reasoning: { type: "string" },

              scenarios: {
                type: "object",
                additionalProperties: false,
                properties: {
                  bullish: { type: "string" },
                  bearish: { type: "string" }
                },
                required: ["bullish", "bearish"]
              }
            },

            required: [
              "symbol",
              "timeframe",
              "market_bias",
              "resistance",
              "support",
              "invalidation",
              "fvg",
              "order_block",
              "liquidity",
              "entry_zone",
              "tp1",
              "tp2",
              "risk_reward",
              "reasoning",
              "scenarios"
            ]
          }
        }
      }
    };

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      let message = "OpenAI API request failed.";

      try {
        message = JSON.parse(raw)?.error?.message || message;
      } catch {}

      return res.status(response.status).json({
        error: message
      });
    }

    const result = JSON.parse(raw);

    if (!result.output_text) {
      return res.status(502).json({
        error: "The AI returned no analysis."
      });
    }

    let analysis;

    try {
      analysis = JSON.parse(result.output_text);
    } catch {
      return res.status(502).json({
        error: "The AI response was not valid structured JSON."
      });
    }

    return res.status(200).json({
      analysis
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Unable to analyze the chart right now."
    });
  }
}
