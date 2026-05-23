import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const defaultInput = {
  period: "monthly",
  units_sold: 15000,
  unit_price: 24,
  unit_cogs: 11,
  operating_expenses: 120000,
  depreciation: 8000,
  amortization: 2000,
  interest: 3000,
  tax_rate: 0.25,
  capex: 25000,
  opening_cash: 100000,
};

const fieldConfig = [
  { key: "units_sold", label: "Units Sold", placeholder: "e.g. 15000" },
  { key: "unit_price", label: "Unit Selling Price", placeholder: "e.g. 24" },
  { key: "unit_cogs", label: "Unit Cost (COGS)", placeholder: "e.g. 11" },
  { key: "operating_expenses", label: "Operating Expenses", placeholder: "e.g. 120000" },
  { key: "depreciation", label: "Depreciation", placeholder: "e.g. 8000" },
  { key: "amortization", label: "Amortization", placeholder: "e.g. 2000" },
  { key: "interest", label: "Interest", placeholder: "e.g. 3000" },
  { key: "tax_rate", label: "Tax Rate (decimal)", placeholder: "e.g. 0.25" },
  { key: "capex", label: "Capital Investment (Capex)", placeholder: "e.g. 25000" },
  { key: "opening_cash", label: "Opening Cash", placeholder: "e.g. 100000" },
];

const requiredNumericFields = fieldConfig.map((f) => f.key);

function pct(num, den) {
  if (!den) return 0;
  return (num / den) * 100;
}

function calculateFinancials(input) {
  const revenue = input.units_sold * input.unit_price;
  const cogs = input.units_sold * input.unit_cogs;
  const gross_profit = revenue - cogs;
  const gross_margin_pct = pct(gross_profit, revenue);

  const ebitda = gross_profit - input.operating_expenses;
  const ebitda_pct = pct(ebitda, revenue);

  const ebit = ebitda - input.depreciation - input.amortization;
  const pbt = ebit - input.interest;
  const tax = Math.max(0, pbt * input.tax_rate);
  const net_profit = pbt - tax;
  const net_profit_pct = pct(net_profit, revenue);

  const closing_cash = input.opening_cash + net_profit - input.capex;

  return {
    revenue,
    cogs,
    gross_profit,
    gross_margin_pct,
    operating_expenses: input.operating_expenses,
    ebitda,
    ebitda_pct,
    tax,
    net_profit,
    net_profit_pct,
    capex: input.capex,
    opening_cash: input.opening_cash,
    closing_cash,
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function validateInput(raw) {
  if (!raw || typeof raw !== "object") {
    return "Input must be a JSON object.";
  }

  if (!["monthly", "quarterly", "yearly"].includes(raw.period)) {
    return "period must be one of: monthly, quarterly, yearly.";
  }

  for (const field of requiredNumericFields) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === "") {
      return `Missing field: ${field}`;
    }

    const numeric = Number(raw[field]);
    if (Number.isNaN(numeric)) {
      return `Field ${field} must be numeric.`;
    }

    if (numeric < 0) {
      return `Field ${field} must be >= 0.`;
    }
  }

  return null;
}

export default function App() {
  const [mode, setMode] = useState("form");
  const [formData, setFormData] = useState(defaultInput);
  const [error, setError] = useState("");
  const [model, setModel] = useState("llama3.1:8b");
  const [prediction, setPrediction] = useState("");
  const [predictionError, setPredictionError] = useState("");
  const [loadingPrediction, setLoadingPrediction] = useState(false);

  const financials = useMemo(() => calculateFinancials(formData), [formData]);

  const handleNumberChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value === "" ? "" : Number(value),
    }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validationError = validateInput(parsed);
      if (validationError) {
        setError(validationError);
        return;
      }

      setFormData({
        ...parsed,
        ...Object.fromEntries(requiredNumericFields.map((k) => [k, Number(parsed[k])])),
      });
      setError("");
      setMode("upload");
    } catch {
      setError("Invalid JSON file. Please upload a valid budget input JSON.");
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    const validationError = validateInput(formData);
    setError(validationError || "");
  };

  const generatePrediction = async () => {
    const validationError = validateInput(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPrediction("");
    setPredictionError("");
    setLoadingPrediction(true);

    const prompt = [
      `You are a CFO assistant for a small company selling physical goods.`,
      `Given these calculated budget metrics for a ${formData.period} plan, provide:`,
      `1) 5 practical budget actions`,
      `2) 3 risk alerts`,
      `3) 3 scenario ideas (upside/base/downside)`,
      `Keep advice concise and numeric where possible.`,
      `Metrics JSON:`,
      JSON.stringify(financials, null, 2),
    ].join("\n");

    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed (${response.status})`);
      }

      const data = await response.json();
      setPrediction(data.response?.trim() || "No prediction text returned by model.");
    } catch (err) {
      setPredictionError(
        `Could not fetch prediction from Ollama. Ensure 'ollama serve' is running and model '${model}' exists. ${err.message}`
      );
    } finally {
      setLoadingPrediction(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Budget AI Agent</p>
        <h1>Small Business Budget Planner</h1>
        <p className="subtext">
          For physical-goods companies: upload JSON or fill the form to get instant P&amp;L,
          gross margin, EBITDA, and net profit analysis.
        </p>
      </header>

      <section className="panel">
        <div className="mode-switch">
          <button
            type="button"
            className={mode === "form" ? "active" : ""}
            onClick={() => setMode("form")}
          >
            Form Entry
          </button>
          <button
            type="button"
            className={mode === "upload" ? "active" : ""}
            onClick={() => setMode("upload")}
          >
            Upload JSON
          </button>
        </div>

        {mode === "upload" ? (
          <div className="uploader">
            <label htmlFor="budget-file">Upload `sample_budget_input.json`-style file</label>
            <input id="budget-file" type="file" accept="application/json,.json" onChange={handleFileUpload} />
          </div>
        ) : (
          <form className="grid" onSubmit={handleFormSubmit}>
            <label>
              Period
              <select
                value={formData.period}
                onChange={(e) => setFormData((prev) => ({ ...prev, period: e.target.value }))}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>

            {fieldConfig.map((field) => (
              <label key={field.key} htmlFor={field.key}>
                {field.label}
                <input
                  id={field.key}
                  name={field.key}
                  type="number"
                  step="any"
                  min="0"
                  placeholder={field.placeholder}
                  value={formData[field.key]}
                  onChange={(e) => handleNumberChange(field.key, e.target.value)}
                />
              </label>
            ))}

            <button type="submit" className="submit-btn">
              Recalculate
            </button>
          </form>
        )}

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="results">
        <h2>Budget Output</h2>
        <div className="cards">
          <MetricCard label="Revenue" value={formatMoney(financials.revenue)} />
          <MetricCard label="COGS" value={formatMoney(financials.cogs)} />
          <MetricCard label="Gross Profit" value={formatMoney(financials.gross_profit)} />
          <MetricCard label="Gross Margin %" value={formatPct(financials.gross_margin_pct)} />
          <MetricCard label="Operating Expenses" value={formatMoney(financials.operating_expenses)} />
          <MetricCard label="EBITDA" value={formatMoney(financials.ebitda)} />
          <MetricCard label="EBITDA %" value={formatPct(financials.ebitda_pct)} />
          <MetricCard label="Tax" value={formatMoney(financials.tax)} />
          <MetricCard label="Net Profit/Loss" value={formatMoney(financials.net_profit)} />
          <MetricCard label="Net Profit/Loss %" value={formatPct(financials.net_profit_pct)} />
          <MetricCard label="Capital Investment" value={formatMoney(financials.capex)} />
          <MetricCard label="Opening Cash" value={formatMoney(financials.opening_cash)} />
          <MetricCard label="Closing Cash (Post-Capex)" value={formatMoney(financials.closing_cash)} />
        </div>
      </section>

      <section className="panel">
        <h2>AI Predictions</h2>
        <div className="prediction-controls">
          <label htmlFor="model-select">
            Model
            <select id="model-select" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="llama3.1:8b">llama3.1:8b (larger)</option>
              <option value="llama3.2:3b">llama3.2:3b (smaller)</option>
            </select>
          </label>

          <button type="button" className="submit-btn" onClick={generatePrediction} disabled={loadingPrediction}>
            {loadingPrediction ? "Generating..." : "Generate AI Predictions"}
          </button>
        </div>

        {predictionError ? <p className="error">{predictionError}</p> : null}

        {prediction ? (
          <div className="prediction-box markdown-output">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{prediction}</ReactMarkdown>
          </div>
        ) : (
          <p className="subtext">No prediction generated yet.</p>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="card">
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
}
