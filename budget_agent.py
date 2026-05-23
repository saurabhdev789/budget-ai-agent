#!/usr/bin/env python3
"""Local AI budgeting agent for small physical-goods businesses.

Uses a local Ollama model (e.g. llama3, gemma3) to generate planning insights,
while core financial metrics are computed deterministically for reliability.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import requests


@dataclass
class BudgetInput:
    period: str
    units_sold: float
    unit_price: float
    unit_cogs: float
    operating_expenses: float
    depreciation: float
    amortization: float
    interest: float
    tax_rate: float
    capex: float
    opening_cash: float


class BudgetValidationError(ValueError):
    pass


def _to_float(data: Dict[str, Any], key: str, minimum: float | None = None) -> float:
    if key not in data:
        raise BudgetValidationError(f"Missing required field: {key}")
    try:
        value = float(data[key])
    except (TypeError, ValueError):
        raise BudgetValidationError(f"Field '{key}' must be numeric")
    if minimum is not None and value < minimum:
        raise BudgetValidationError(f"Field '{key}' must be >= {minimum}")
    return value


def load_budget_input(path: Path) -> BudgetInput:
    payload = json.loads(path.read_text())

    period = str(payload.get("period", "monthly"))
    if period not in {"monthly", "quarterly", "yearly"}:
        raise BudgetValidationError("'period' must be one of: monthly, quarterly, yearly")

    return BudgetInput(
        period=period,
        units_sold=_to_float(payload, "units_sold", 0),
        unit_price=_to_float(payload, "unit_price", 0),
        unit_cogs=_to_float(payload, "unit_cogs", 0),
        operating_expenses=_to_float(payload, "operating_expenses", 0),
        depreciation=_to_float(payload, "depreciation", 0),
        amortization=_to_float(payload, "amortization", 0),
        interest=_to_float(payload, "interest", 0),
        tax_rate=_to_float(payload, "tax_rate", 0),
        capex=_to_float(payload, "capex", 0),
        opening_cash=_to_float(payload, "opening_cash", 0),
    )


def pct(num: float, den: float) -> float:
    if math.isclose(den, 0.0):
        return 0.0
    return (num / den) * 100.0


def calculate_financials(inp: BudgetInput) -> Dict[str, float]:
    revenue = inp.units_sold * inp.unit_price
    cogs = inp.units_sold * inp.unit_cogs
    gross_profit = revenue - cogs
    gross_margin_pct = pct(gross_profit, revenue)

    ebitda = gross_profit - inp.operating_expenses
    ebitda_pct = pct(ebitda, revenue)

    ebit = ebitda - inp.depreciation - inp.amortization
    pbt = ebit - inp.interest

    tax = max(0.0, pbt * inp.tax_rate)
    net_profit = pbt - tax
    net_profit_pct = pct(net_profit, revenue)

    closing_cash = inp.opening_cash + net_profit - inp.capex

    return {
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "gross_margin_pct": gross_margin_pct,
        "operating_expenses": inp.operating_expenses,
        "ebitda": ebitda,
        "ebitda_pct": ebitda_pct,
        "depreciation": inp.depreciation,
        "amortization": inp.amortization,
        "interest": inp.interest,
        "tax": tax,
        "net_profit": net_profit,
        "net_profit_pct": net_profit_pct,
        "capex": inp.capex,
        "opening_cash": inp.opening_cash,
        "closing_cash": closing_cash,
    }


def call_ollama(model: str, financials: Dict[str, float], period: str) -> str:
    url = "http://localhost:11434/api/generate"

    prompt = f"""
You are a CFO assistant for a small company selling physical goods.
Given these calculated budget metrics for a {period} plan, provide:
1) 5 practical budget actions
2) 3 risk alerts
3) 3 scenario ideas (upside/base/downside)
Keep advice concise and numeric where possible.

Metrics JSON:
{json.dumps(financials, indent=2)}
""".strip()

    response = requests.post(
        url,
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    return str(data.get("response", "")).strip()


def print_summary(financials: Dict[str, float]) -> None:
    print("\n=== Budget Summary ===")
    print(f"Revenue:                 {financials['revenue']:.2f}")
    print(f"COGS:                    {financials['cogs']:.2f}")
    print(f"Gross Profit:            {financials['gross_profit']:.2f}")
    print(f"Gross Margin %:          {financials['gross_margin_pct']:.2f}%")
    print(f"Operating Expenses:      {financials['operating_expenses']:.2f}")
    print(f"EBITDA:                  {financials['ebitda']:.2f}")
    print(f"EBITDA %:                {financials['ebitda_pct']:.2f}%")
    print(f"Tax:                     {financials['tax']:.2f}")
    print(f"Net Profit/Loss:         {financials['net_profit']:.2f}")
    print(f"Net Profit/Loss %:       {financials['net_profit_pct']:.2f}%")
    print(f"Capital Investment:      {financials['capex']:.2f}")
    print(f"Opening Cash:            {financials['opening_cash']:.2f}")
    print(f"Closing Cash (post-capex){financials['closing_cash']:.2f}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI budgeting agent (Ollama + deterministic finance engine)")
    parser.add_argument("--input", required=True, help="Path to input JSON")
    parser.add_argument("--model", default="llama3", help="Ollama model name (e.g. llama3, gemma3)")
    parser.add_argument("--skip-llm", action="store_true", help="Only print computed budget metrics")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        budget_input = load_budget_input(Path(args.input))
        financials = calculate_financials(budget_input)
    except (OSError, json.JSONDecodeError, BudgetValidationError) as exc:
        print(f"Input error: {exc}", file=sys.stderr)
        return 1

    print_summary(financials)

    if args.skip_llm:
        return 0

    try:
        advice = call_ollama(args.model, financials, budget_input.period)
    except requests.RequestException as exc:
        print("\nLLM call failed. Make sure Ollama is running (`ollama serve`) and the model is pulled.")
        print(f"Details: {exc}")
        return 2

    print("\n=== AI Budget Recommendations ===")
    print(advice)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
