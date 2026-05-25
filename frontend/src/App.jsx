import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as XLSX from "xlsx";
import "./App.css";

const defaultInput = {
  period: "monthly",
  units_sold: "",
  unit_price: "",
  unit_cogs: "",
  operating_expenses: "",
  depreciation: "",
  amortization: "",
  interest: "",
  tax_rate: "",
  capex: "",
  opening_cash: "",
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

function toNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function calculateFinancials(input) {
  const unitsSold = toNumber(input.units_sold);
  const unitPrice = toNumber(input.unit_price);
  const unitCogs = toNumber(input.unit_cogs);
  const operatingExpenses = toNumber(input.operating_expenses);
  const depreciation = toNumber(input.depreciation);
  const amortization = toNumber(input.amortization);
  const interest = toNumber(input.interest);
  const taxRate = toNumber(input.tax_rate);
  const capex = toNumber(input.capex);
  const openingCash = toNumber(input.opening_cash);

  const revenue = unitsSold * unitPrice;
  const cogs = unitsSold * unitCogs;
  const gross_profit = revenue - cogs;
  const gross_margin_pct = pct(gross_profit, revenue);

  const ebitda = gross_profit - operatingExpenses;
  const ebitda_pct = pct(ebitda, revenue);

  const ebit = ebitda - depreciation - amortization;
  const pbt = ebit - interest;
  const tax = Math.max(0, pbt * taxRate);
  const net_profit = pbt - tax;
  const net_profit_pct = pct(net_profit, revenue);

  const closing_cash = openingCash + net_profit - capex;

  return {
    revenue,
    cogs,
    gross_profit,
    gross_margin_pct,
    operating_expenses: operatingExpenses,
    ebitda,
    ebitda_pct,
    tax,
    net_profit,
    net_profit_pct,
    capex,
    opening_cash: openingCash,
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

function normalizeSpreadsheetRow(row) {
  if (!row || typeof row !== "object") {
    return {};
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    key.trim().toLowerCase().replaceAll(" ", "_"),
    value,
  ]);

  return Object.fromEntries(normalizedEntries);
}

function parseCsvText(text) {
  const workbook = XLSX.read(text, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  return normalizeSpreadsheetRow(rows[0]);
}

function parseExcelBuffer(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  return normalizeSpreadsheetRow(rows[0]);
}

export default function App() {
  const [mode, setMode] = useState("form");
  const [formData, setFormData] = useState(defaultInput);
  const [error, setError] = useState("");
  const [model, setModel] = useState("llama3.2:3b");
  const [prediction, setPrediction] = useState("");
  const [predictionError, setPredictionError] = useState("");
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedFileData, setParsedFileData] = useState(null);

  const financials = useMemo(() => calculateFinancials(formData), [formData]);

  const handleNumberChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value === "" ? "" : Number(value),
    }));
  };

  const parseFile = async (file) => {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".json")) {
      const text = await file.text();
      return JSON.parse(text);
    }
    if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
      const text = await file.text();
      return parseCsvText(text);
    }
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      return parseExcelBuffer(buffer);
    }
    throw new Error("Unsupported file type");
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    setParsedFileData(null);
    setError("");
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      setParsedFileData(parsed);
    } catch {
      setError(
        "Invalid file. Upload JSON, Excel (.xlsx/.xls), CSV, or TSV with headers like units_sold, unit_price, unit_cogs, operating_expenses, depreciation, amortization, interest, tax_rate, capex, opening_cash, period."
      );
    }
  };

  const handleFileCalculate = async () => {
    if (!selectedFile) {
      setError("Please select a file first.");
      return;
    }

    const parsed = parsedFileData || (await parseFile(selectedFile));
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
      const response = await fetch("/ollama/api/generate", {
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
            Upload File
          </button>
        </div>

        {mode === "upload" ? (
          <div className="uploader">
            <label htmlFor="budget-file">Upload JSON, Excel, CSV, or TSV (Google Sheets/Numbers export works)</label>
            <div className="template-links">
              <a href="/templates/sample_budget_input.xlsx" download>
                Download Sample Excel (.xlsx)
              </a>
              <a href="/templates/sample_budget_input.csv" download>
                Download Sample CSV (.csv)
              </a>
            </div>
            <input
              id="budget-file"
              type="file"
              accept="application/json,.json,.xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleFileSelect}
            />
            <button type="button" className="submit-btn" onClick={handleFileCalculate}>
              Calculate from File
            </button>
            {parsedFileData ? (
              <div className="parsed-preview">
                <h3>Parsed Input Preview</h3>
                <div className="preview-grid">
                  <PreviewRow label="Period" value={String(parsedFileData.period ?? "")} />
                  {fieldConfig.map((field) => (
                    <PreviewRow key={field.key} label={field.label} value={String(parsedFileData[field.key] ?? "")} />
                  ))}
                </div>
              </div>
            ) : null}
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
              <option value="llama3.2:3b">llama3.2:3b (smaller)</option>
              <option value="llama3.1:8b">llama3.1:8b (larger)</option>
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

function PreviewRow({ label, value }) {
  return (
    <div className="preview-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}
