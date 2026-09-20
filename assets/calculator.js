/* calculator.js — carownercost.com
 * Tools: carPayment · affordability · lease · refinance · payoff · gasTrip · mpg · evCost · depreciation · salesTax
 *
 * DATA — assets/car-data.js (window.CARDATA), parsed from saved sources on 2026-09-16:
 *   · Gas: EIA Gasoline and Diesel Fuel Update — U.S. regular gasoline retail price, the latest weekly release
 *     (U.S., the regional series EIA publishes and the 9 states it lists). Users pick EIA's own price area, or
 *     type their local price; no state is mapped to a region by us.
 *   · Sales tax: Tax Foundation, 2026 Sales Tax Rates, Midyear Update — state rate and average local rate.
 *     Many states tax vehicles differently from general sales (caps, separate vehicle taxes, trade-in rules), so
 *     the rate is a starting point the user can edit, and the page says so.
 *   · Electricity (EV tool): EIA Electric Power Monthly Table 5.6.A residential ¢/kWh by state (same file as the
 *     solar site's data, fetched 2026-09-16).
 * ASSUMPTIONS the user controls, labelled on the page: depreciation rate, the share of income for a car
 * payment, EV efficiency and MPG.
 */
(function (root, factory) {
  const C = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = C; else root.CALCS = C;
})(typeof self !== 'undefined' ? self : this, function (root) {
  let DATA = root && root.CARDATA;
  const r2 = n => Math.round(n * 100) / 100;

  // ── loan math ────────────────────────────────────────────────────────────
  const payment = (principal, aprPct, months) => { const r = aprPct / 100 / 12; return months <= 0 ? 0 : r === 0 ? principal / months : principal * r / (1 - Math.pow(1 + r, -months)); };
  const principalFor = (pmt, aprPct, months) => { const r = aprPct / 100 / 12; return r === 0 ? pmt * months : pmt * (1 - Math.pow(1 + r, -months)) / r; };
  function amortize(balance, aprPct, pmt, maxMonths = 1200) {
    const r = aprPct / 100 / 12; let n = 0, interest = 0;
    const rows = [];
    while (balance > 0.005 && n < maxMonths) {
      const i = balance * r; interest += i;
      const pay = Math.min(pmt, balance + i);
      if (pay <= i && n > 0) return { months: Infinity, interest: Infinity, rows };
      balance = balance + i - pay; n++;
      if (n % 12 === 0 || balance <= 0.005) rows.push({ month: n, balance: Math.max(0, balance), interest });
    }
    return { months: n, interest, rows };
  }

  const stateOptions = () => DATA ? Object.entries(DATA.states).map(([ab, s]) => ({ value: ab, label: s.name })).sort((a, b) => a.label.localeCompare(b.label)) : [];
  const salesRate = ab => { const s = DATA && DATA.sales.rates[ab]; return s ? r2(((s.state || 0) + (s.avg_local || 0)) * 100) : 0; };
  const gasAreas = () => DATA ? Object.keys(DATA.gas.prices).map(k => ({ value: k, label: `${k} — $${DATA.gas.prices[k].toFixed(3)}` })) : [];

  const carPayment = {
    title: 'Car payment calculator',
    inputs: [
      { id: 'price', label: 'Vehicle price', type: 'number', prefix: '$', default: 35000, min: 0 },
      { id: 'down', label: 'Down payment', type: 'number', prefix: '$', default: 5000, min: 0 },
      { id: 'trade', label: 'Trade-in value', type: 'number', prefix: '$', default: 3000, min: 0 },
      { id: 'state', label: 'State (sets the default sales tax)', type: 'select', default: 'TX', options: stateOptions },
      { id: 'taxRate', label: 'Sales tax rate (edit for your city or your state’s vehicle rule)', type: 'number', suffix: '%', default: null, min: 0, max: 20, step: 0.01 },
      { id: 'tradeCredit', label: 'My state taxes only the price minus the trade-in', type: 'checkbox', default: true },
      { id: 'fees', label: 'Title, registration and dealer fees (financed)', type: 'number', prefix: '$', default: 500, min: 0 },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 6.5, min: 0, max: 40, step: 0.01 },
      { id: 'months', label: 'Loan term', type: 'select', default: '60', options: ['24', '36', '48', '60', '72', '84'].map(m => ({ value: m, label: `${m} months` })) },
    ],
    compute(v, fmt) {
      const rate = v.taxRate != null ? v.taxRate : salesRate(v.state);
      const taxable = Math.max(0, (v.price || 0) - (v.tradeCredit ? (v.trade || 0) : 0));
      const tax = taxable * rate / 100;
      const loan = Math.max(0, (v.price || 0) - (v.down || 0) - (v.trade || 0) + tax + (v.fees || 0));
      const n = Number(v.months);
      const p = payment(loan, v.apr || 0, n);
      return {
        raw: { tax: r2(tax), loan: r2(loan), payment: r2(p), interest: r2(p * n - loan), rate },
        summary: [
          { label: 'Monthly payment', value: fmt.money(p), strong: true },
          { label: 'Amount financed', value: fmt.money0(loan) },
          { label: 'Total interest', value: fmt.money0(p * n - loan) },
          { label: 'Total cost (all payments + down + trade)', value: fmt.money0(p * n + (v.down || 0) + (v.trade || 0)) },
        ],
        rows: [{ label: 'Price', value: fmt.money0(v.price || 0) }, { label: `Sales tax at ${rate}%`, value: `+ ${fmt.money(tax)}` }, { label: 'Fees', value: `+ ${fmt.money0(v.fees || 0)}` }, { label: 'Down payment', value: `− ${fmt.money0(v.down || 0)}` }, { label: 'Trade-in', value: `− ${fmt.money0(v.trade || 0)}` }, { label: 'Amount financed', value: fmt.money0(loan), total: true }],
        notes: [v.taxRate != null ? 'Using the sales tax rate you entered.' : `Default rate = ${DATA ? DATA.states[v.state]?.name : 'state'} state rate + average local rate (Tax Foundation, 2026 midyear). Vehicle taxes can differ from general sales tax — check your state DMV.`, 'Estimate only; your lender’s offer decides the real payment.'],
      };
    },
  };

  const affordability = {
    title: 'Car affordability calculator',
    inputs: [
      { id: 'income', label: 'Yearly gross income', type: 'number', prefix: '$', default: 72000, min: 0 },
      { id: 'pct', label: 'Share of monthly income for the car payment (your rule)', type: 'number', suffix: '%', default: 10, min: 1, max: 50, step: 0.5 },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 6, min: 0, max: 40, step: 0.01 },
      { id: 'months', label: 'Loan term', type: 'select', default: '48', options: ['36', '48', '60', '72'].map(m => ({ value: m, label: `${m} months` })) },
      { id: 'down', label: 'Down payment and trade-in', type: 'number', prefix: '$', default: 4000, min: 0 },
    ],
    compute(v, fmt) {
      const pmt = (v.income || 0) / 12 * (v.pct || 0) / 100;
      const loan = principalFor(pmt, v.apr || 0, Number(v.months));
      return {
        raw: { payment: r2(pmt), loan: r2(loan), price: r2(loan + (v.down || 0)) },
        summary: [{ label: 'Car price you can afford', value: fmt.money0(loan + (v.down || 0)), strong: true }, { label: 'Monthly payment', value: fmt.money(pmt) }, { label: 'Maximum loan', value: fmt.money0(loan) }],
        notes: ['The price includes taxes and fees you finance. Insurance, fuel and maintenance come on top of the payment.'],
      };
    },
  };

  const lease = {
    title: 'Car lease calculator',
    inputs: [
      { id: 'msrp', label: 'MSRP', type: 'number', prefix: '$', default: 36000, min: 0 },
      { id: 'capCost', label: 'Negotiated price (capitalized cost) after down payment', type: 'number', prefix: '$', default: 32000, min: 0 },
      { id: 'residualPct', label: 'Residual value (from the lease offer)', type: 'number', suffix: '% of MSRP', default: 58, min: 0, max: 100 },
      { id: 'rateType', label: 'Rate given as', type: 'radio', default: 'mf', options: [{ value: 'mf', label: 'Money factor' }, { value: 'apr', label: 'APR' }] },
      { id: 'mf', label: 'Money factor', type: 'number', default: 0.0025, min: 0, step: 0.00001, showIf: s => s.rateType !== 'apr' },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 6, min: 0, step: 0.01, showIf: s => s.rateType === 'apr' },
      { id: 'months', label: 'Lease term (months)', type: 'number', default: 36, min: 12, max: 60 },
      { id: 'taxPct', label: 'Sales tax on the monthly payment', type: 'number', suffix: '%', default: 0, min: 0, max: 15, step: 0.01 },
    ],
    compute(v, fmt) {
      const mf = v.rateType === 'apr' ? (v.apr || 0) / 2400 : (v.mf || 0);
      const residual = (v.msrp || 0) * (v.residualPct || 0) / 100;
      const dep = ((v.capCost || 0) - residual) / (v.months || 1);
      const fin = ((v.capCost || 0) + residual) * mf;
      const pre = dep + fin;
      const pay = pre * (1 + (v.taxPct || 0) / 100);
      return {
        raw: { residual: r2(residual), depreciation: r2(dep), finance: r2(fin), payment: r2(pay), aprEquivalent: r2(mf * 2400) },
        summary: [{ label: 'Monthly lease payment', value: fmt.money(pay), strong: true }, { label: 'Depreciation part', value: fmt.money(dep) }, { label: 'Rent (finance) part', value: fmt.money(fin) }, { label: 'Total of payments', value: fmt.money0(pay * (v.months || 0)) }],
        notes: [`Money factor ${mf.toFixed(5)} ≈ ${r2(mf * 2400)}% APR (money factor × 2,400). Excludes acquisition and disposition fees unless you add them to the price.`],
      };
    },
  };

  const refinance = {
    title: 'Auto refinance calculator',
    inputs: [
      { id: 'balance', label: 'Current loan balance', type: 'number', prefix: '$', default: 18000, min: 0 },
      { id: 'oldApr', label: 'Current APR', type: 'number', suffix: '%', default: 9, min: 0, step: 0.01 },
      { id: 'monthsLeft', label: 'Months left on the current loan', type: 'number', default: 48, min: 1 },
      { id: 'newApr', label: 'New APR (from the refinance offer)', type: 'number', suffix: '%', default: 5.5, min: 0, step: 0.01 },
      { id: 'newMonths', label: 'New loan term (months)', type: 'number', default: 48, min: 1 },
      { id: 'fees', label: 'Refinance fees paid upfront', type: 'number', prefix: '$', default: 300, min: 0 },
    ],
    compute(v, fmt) {
      const oldP = payment(v.balance || 0, v.oldApr || 0, v.monthsLeft || 1), newP = payment(v.balance || 0, v.newApr || 0, v.newMonths || 1);
      const oldTotal = oldP * (v.monthsLeft || 0), newTotal = newP * (v.newMonths || 0);
      const saved = oldTotal - newTotal - (v.fees || 0);
      return {
        raw: { oldPayment: r2(oldP), newPayment: r2(newP), saved: r2(saved) },
        warnings: saved < 0 ? ['At these numbers refinancing costs you more overall (a longer term can do this even at a lower rate).'] : [],
        summary: [{ label: saved >= 0 ? 'Total you save' : 'Total extra cost', value: fmt.money0(Math.abs(saved)), strong: true }, { label: 'New monthly payment', value: fmt.money(newP) }, { label: 'Current monthly payment', value: fmt.money(oldP) }],
      };
    },
  };

  const payoff = {
    title: 'Car loan payoff calculator',
    inputs: [
      { id: 'balance', label: 'Loan balance', type: 'number', prefix: '$', default: 20000, min: 0 },
      { id: 'apr', label: 'APR', type: 'number', suffix: '%', default: 7, min: 0, step: 0.01 },
      { id: 'payment', label: 'Monthly payment', type: 'number', prefix: '$', default: 400, min: 0 },
      { id: 'extra', label: 'Extra paid each month', type: 'number', prefix: '$', default: 100, min: 0 },
    ],
    compute(v, fmt) {
      const base = amortize(v.balance || 0, v.apr || 0, v.payment || 0);
      const fast = amortize(v.balance || 0, v.apr || 0, (v.payment || 0) + (v.extra || 0));
      if (!isFinite(base.months)) return { warnings: ['This payment does not cover the monthly interest, so the loan never shrinks.'] };
      return {
        raw: { months: base.months, interest: r2(base.interest), fastMonths: fast.months, fastInterest: r2(fast.interest), monthsSaved: base.months - fast.months, interestSaved: r2(base.interest - fast.interest) },
        summary: [{ label: 'Paid off in', value: `${fast.months} months`, strong: true }, { label: 'Months saved', value: String(base.months - fast.months) }, { label: 'Interest saved', value: fmt.money0(base.interest - fast.interest) }],
        rows: fast.rows.map(r => ({ label: `After month ${r.month}`, value: `${fmt.money0(r.balance)} left` })),
        notes: ['Check that your lender applies extra payments to principal and does not charge a prepayment penalty.'],
      };
    },
  };

  const gasTrip = {
    title: 'Gas cost calculator',
    inputs: [
      { id: 'miles', label: 'Trip distance (one way)', type: 'number', suffix: 'miles', default: 300, min: 0 },
      { id: 'roundTrip', label: 'Round trip', type: 'checkbox', default: true },
      { id: 'mpg', label: 'Your car’s MPG', type: 'number', default: 30, min: 1, max: 150, step: 0.1 },
      { id: 'area', label: 'Gas price area (EIA weekly average)', type: 'select', default: 'U.S.', options: gasAreas },
      { id: 'price', label: 'Or your own gas price', type: 'number', prefix: '$', default: null, min: 0, step: 0.001 },
      { id: 'people', label: 'People splitting the cost', type: 'number', default: 1, min: 1, max: 20 },
    ],
    compute(v, fmt) {
      if (!DATA) return { warnings: ['Gas price data did not load.'] };
      const price = v.price || DATA.gas.prices[v.area] || DATA.gas.prices['U.S.'];
      const miles = (v.miles || 0) * (v.roundTrip ? 2 : 1);
      const gallons = miles / (v.mpg || 1);
      const cost = gallons * price;
      return {
        raw: { miles, gallons: r2(gallons), cost: r2(cost), perPerson: r2(cost / (v.people || 1)), price },
        summary: [{ label: 'Gas cost', value: fmt.money(cost), strong: true }, { label: 'Per person', value: fmt.money(cost / (v.people || 1)) }, { label: 'Gallons needed', value: String(r2(gallons)) }],
        notes: [v.price ? 'Using the price you entered.' : `EIA regular gasoline, ${v.area}, week of ${DATA.gas.week} (released ${DATA.gas.release_date}): $${price.toFixed(3)}/gal.`],
      };
    },
  };

  const mpg = {
    title: 'MPG calculator',
    inputs: [
      { id: 'miles', label: 'Miles driven since the last fill-up', type: 'number', default: 320, min: 0 },
      { id: 'gallons', label: 'Gallons to refill', type: 'number', default: 11.5, min: 0.01, step: 0.001 },
      { id: 'price', label: 'Price per gallon paid', type: 'number', prefix: '$', default: 4.319, min: 0, step: 0.001 },
    ],
    compute(v, fmt) {
      const m = (v.miles || 0) / (v.gallons || 1);
      return {
        raw: { mpg: r2(m), costPerMile: Math.round((v.price || 0) / m * 1000) / 1000, l100km: r2(235.215 / m) },
        summary: [{ label: 'Fuel economy', value: `${r2(m)} MPG`, strong: true }, { label: 'Cost per mile', value: fmt.money((v.price || 0) / m) }, { label: 'Liters per 100 km', value: String(r2(235.215 / m)) }],
        notes: ['MPG = miles ÷ gallons. L/100 km = 235.215 ÷ MPG (U.S. gallons).'],
      };
    },
  };

  const evCost = {
    title: 'EV charging cost calculator',
    inputs: [
      { id: 'state', label: 'State (sets the home electricity price)', type: 'select', default: 'TX', options: stateOptions },
      { id: 'kwhPrice', label: 'Or your own electricity price', type: 'number', suffix: '¢/kWh', default: null, min: 0, step: 0.01 },
      { id: 'miles', label: 'Miles driven per year', type: 'number', default: 12000, min: 0 },
      { id: 'efficiency', label: 'EV efficiency (from the window sticker)', type: 'number', suffix: 'kWh/100 mi', default: 30, min: 10, max: 80, step: 0.1 },
      { id: 'mpg', label: 'Gas car MPG to compare', type: 'number', default: 30, min: 1, max: 150, step: 0.1 },
      { id: 'area', label: 'Gas price area (EIA weekly average)', type: 'select', default: 'U.S.', options: gasAreas },
    ],
    compute(v, fmt) {
      if (!DATA) return { warnings: ['Price data did not load.'] };
      const cents = v.kwhPrice || DATA.states[v.state]?.priceCents || DATA.us_electricity;
      const kwh = (v.miles || 0) * (v.efficiency || 0) / 100;
      const ev = kwh * cents / 100;
      const gasPrice = DATA.gas.prices[v.area] || DATA.gas.prices['U.S.'];
      const gas = (v.miles || 0) / (v.mpg || 1) * gasPrice;
      return {
        raw: { kwh: r2(kwh), ev: r2(ev), gas: r2(gas), savings: r2(gas - ev) },
        summary: [{ label: 'Yearly home charging cost', value: fmt.money0(ev), strong: true }, { label: 'Same miles in the gas car', value: fmt.money0(gas) }, { label: gas >= ev ? 'You save per year' : 'The EV costs more by', value: fmt.money0(Math.abs(gas - ev)) }],
        notes: [`Electricity ${cents}¢/kWh (${v.kwhPrice ? 'your price' : `EIA residential average, ${DATA.electricity_period}`}); gas $${gasPrice.toFixed(3)}/gal (EIA, week of ${DATA.gas.week}). Home charging only; public fast charging usually costs more per kWh. Charging losses are not included.`],
      };
    },
  };

  const depreciation = {
    title: 'Car depreciation calculator',
    inputs: [
      { id: 'price', label: 'Purchase price', type: 'number', prefix: '$', default: 40000, min: 0 },
      { id: 'rate', label: 'Yearly value loss (your assumption)', type: 'number', suffix: '%', default: 15, min: 0, max: 60, step: 0.1, help: 'Check real resale prices for your model and mileage to choose this.' },
      { id: 'firstYear', label: 'Extra first-year loss (your assumption)', type: 'number', suffix: '%', default: 0, min: 0, max: 50, step: 0.1 },
      { id: 'years', label: 'Years you keep the car', type: 'number', default: 5, min: 1, max: 20 },
    ],
    compute(v, fmt) {
      let val = (v.price || 0) * (1 - (v.firstYear || 0) / 100);
      const rows = [];
      for (let y = 1; y <= (v.years || 0); y++) { val *= 1 - (v.rate || 0) / 100; rows.push({ label: `End of year ${y}`, value: fmt.money0(val) }); }
      return {
        raw: { value: r2(val), lost: r2((v.price || 0) - val) },
        summary: [{ label: `Value after ${v.years} years`, value: fmt.money0(val), strong: true }, { label: 'Value lost', value: fmt.money0((v.price || 0) - val) }, { label: 'Share of price kept', value: fmt.pct(v.price ? val / v.price * 100 : 0) }],
        rows,
        notes: ['Declining-balance estimate at the rate you choose; real resale values vary by model, mileage and condition.'],
      };
    },
  };

  const salesTax = {
    title: 'Car sales tax calculator',
    inputs: [
      { id: 'state', label: 'State', type: 'select', default: 'CA', options: stateOptions },
      { id: 'price', label: 'Vehicle price', type: 'number', prefix: '$', default: 30000, min: 0 },
      { id: 'trade', label: 'Trade-in value', type: 'number', prefix: '$', default: 0, min: 0 },
      { id: 'tradeCredit', label: 'My state taxes only the price minus the trade-in', type: 'checkbox', default: true },
      { id: 'localPct', label: 'Your local rate (blank = state average local rate)', type: 'number', suffix: '%', default: null, min: 0, max: 10, step: 0.01 },
    ],
    compute(v, fmt) {
      if (!DATA) return { warnings: ['Sales tax data did not load.'] };
      const s = DATA.sales.rates[v.state] || { state: 0, avg_local: 0 };
      const statePct = (s.state || 0) * 100, localPct = v.localPct != null ? v.localPct : (s.avg_local || 0) * 100;
      const base = Math.max(0, (v.price || 0) - (v.tradeCredit ? (v.trade || 0) : 0));
      const stateTax = base * statePct / 100, localTax = base * localPct / 100;
      return {
        raw: { statePct: r2(statePct), localPct: r2(localPct), total: r2(stateTax + localTax) },
        summary: [{ label: 'Estimated sales tax', value: fmt.money(stateTax + localTax), strong: true }, { label: `State rate`, value: `${r2(statePct)}%` }, { label: v.localPct != null ? 'Your local rate' : 'Average local rate', value: `${r2(localPct)}%` }],
        notes: [`Rates: Tax Foundation, 2026 midyear. Several states use a separate vehicle tax, cap the tax, or treat trade-ins differently — confirm with your state DMV or revenue department before you buy.`],
      };
    },
  };

  return {
    carPayment, affordability, lease, refinance, payoff, gasTrip, mpg, evCost, depreciation, salesTax,
    __setData: d => { DATA = d; },
    __pure: { payment, principalFor, amortize },
    // Expected values: build/tests/car_expected.py. Fixture data keeps them stable when the weekly gas price changes.
    __testData: { states: { TX: { name: 'Texas', priceCents: 18.34 }, CA: { name: 'California', priceCents: 34.74 } }, us_electricity: 18.34, electricity_period: 'June 2026',
      gas: { week: '09/14/26', release_date: 'September 15, 2026', prices: { 'U.S.': 4.319, 'Texas': 3.806 } },
      sales: { rates: { TX: { state: 0.0625, avg_local: 0.0195 }, CA: { state: 0.0725, avg_local: 0.0178 }, OR: { state: 0, avg_local: 0 } } } },
    __tests: [
      { calc: 'carPayment', name: '$35k, $5k down, $3k trade, 6.25% tax, $500 fees, 6.5% × 60 → $577.20', input: { price: 35000, down: 5000, trade: 3000, state: 'TX', taxRate: 6.25, tradeCredit: true, fees: 500, apr: 6.5, months: '60' },
        expect: { tax: 2000, loan: 29500, payment: 577.2, interest: 5132.08 } },
      { calc: 'carPayment', name: 'default tax = state + average local (Texas 8.2%)', input: { price: 10000, down: 0, trade: 0, state: 'TX', taxRate: null, fees: 0, apr: 0, months: '24' }, expect: { rate: 8.2, tax: 820 } },
      { calc: 'affordability', name: '$72k income, 10%, 6% × 48, $4k down → $29,548', input: { income: 72000, pct: 10, apr: 6, months: '48', down: 4000 }, expect: { payment: 600, loan: 25548.19, price: 29548.19 } },
      { calc: 'lease', name: 'cap $32k, residual 58% of $36k, MF 0.0025, 36 mo → $441.09', input: { msrp: 36000, capCost: 32000, residualPct: 58, rateType: 'mf', mf: 0.0025, months: 36, taxPct: 0 }, expect: { residual: 20880, depreciation: 308.89, finance: 132.2, payment: 441.09, aprEquivalent: 6 } },
      { calc: 'refinance', name: '$18k from 9% to 5.5% over 48 mo, $300 fee → save $1,107', input: { balance: 18000, oldApr: 9, monthsLeft: 48, newApr: 5.5, newMonths: 48, fees: 300 }, expect: { oldPayment: 447.93, newPayment: 418.62, saved: 1107.08 } },
      { calc: 'payoff', name: '$20k at 7%, $400/mo → 60 months; +$100 → 46 months', input: { balance: 20000, apr: 7, payment: 400, extra: 100 }, expect: { months: 60, interest: 3715.34, fastMonths: 46, fastInterest: 2841.23, monthsSaved: 14 } },
      { calc: 'gasTrip', name: '300 mi each way at 30 MPG, $4.319 → $86.38, 3 people $28.79', input: { miles: 300, roundTrip: true, mpg: 30, area: 'U.S.', price: null, people: 3 }, expect: { miles: 600, gallons: 20, cost: 86.38, perPerson: 28.79 } },
      { calc: 'mpg', name: '320 mi on 11.5 gal = 27.83 MPG', input: { miles: 320, gallons: 11.5, price: 4.319 }, expect: { mpg: 27.83 } },
      { calc: 'evCost', name: '12,000 mi at 30 kWh/100 mi, 18.34¢ vs 30 MPG at $4.319', input: { state: 'TX', kwhPrice: null, miles: 12000, efficiency: 30, mpg: 30, area: 'U.S.' }, expect: { kwh: 3600, ev: 660.24, gas: 1727.6, savings: 1067.36 } },
      { calc: 'depreciation', name: '$40k at 15%/yr for 5 years → $17,748.21', input: { price: 40000, rate: 15, firstYear: 0, years: 5 }, expect: { value: 17748.21 } },
      { calc: 'salesTax', name: 'California $30k: 7.25% + 1.78% average local', input: { state: 'CA', price: 30000, trade: 0, localPct: null }, expect: { statePct: 7.25, localPct: 1.78, total: 2709 } },
      { calc: 'salesTax', name: 'Oregon has no sales tax', input: { state: 'OR', price: 30000, trade: 0, localPct: null }, expect: { total: 0 } },
    ],
  };
});
