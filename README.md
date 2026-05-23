# Budget AI Agent (Local, Free LLM)

Local CLI agent for small physical-goods businesses.

It computes:
- Revenue
- COGS
- Gross Profit
- Gross Margin %
- EBITDA
- EBITDA %
- Net Profit/Loss
- Net Profit/Loss %
- Capital Investment (Capex)
- Closing cash impact

And then asks a local free LLM (`llama3` or `gemma3`) for planning recommendations.

## 1) Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install Ollama from [https://ollama.com](https://ollama.com), then:

```bash
ollama serve
ollama pull llama3
# or
ollama pull gemma3
```

## 2) Run

With deterministic calculation only:

```bash
python3 budget_agent.py --input sample_budget_input.json --skip-llm
```

With AI recommendations:

```bash
python3 budget_agent.py --input sample_budget_input.json --model llama3
# or
python3 budget_agent.py --input sample_budget_input.json --model gemma3
```

## 3) Input format

Use a JSON file like:

```json
{
  "period": "monthly",
  "units_sold": 15000,
  "unit_price": 24,
  "unit_cogs": 11,
  "operating_expenses": 120000,
  "depreciation": 8000,
  "amortization": 2000,
  "interest": 3000,
  "tax_rate": 0.25,
  "capex": 25000,
  "opening_cash": 100000
}
```

`period` can be `monthly`, `quarterly`, or `yearly`.

## 4) React Frontend (Upload JSON or Form Input)

```bash
cd frontend
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

Features:
- Upload a JSON file in the same structure as `sample_budget_input.json`
- Or enter values manually in a form
- Instant calculation of revenue, cost, gross margin, EBITDA, EBITDA %, net profit/loss, and net profit/loss %
