import { useMemo, useState } from "react";
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

const requiredNumericFields = [
  "units_sold",
  "unit_price",
  "unit_cogs",
  "operating_expenses",
  "depreciation",
  "amortization",
  "interest",
  "tax_rate",
  "capex",
  "opening_cash",
];

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

            {requiredNumericFields.map((field) => (
              <label key={field}>
                {field.replaceAll("_", " ")}
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={formData[field]}
                  onChange={(e) => handleNumberChange(field, e.target.value)}
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
