# SIH26183 — Person 4 Frontend Prototype

This is an **isolated frontend** for Person 4. It is designed to be copied into the team's `frontend/` folder without editing Person 1 or Person 2 source code.

## What it uses

- React + Vite
- Cytoscape.js for the dense transaction network
- The supplied `btc_output.json`
- The supplied `attribution_output.json`
- jsPDF for the report button

## Data integration

The supplied BTC output contains:

- `case_id`: `CASE-001`
- `source_wallet`: `1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC`
- `234` graph nodes
- `368` transfer edges
- `262` transactions in trace metadata
- max trace depth `4`
- `patterns: []`
- trace marked truncated because of `max_runtime`

The attribution output contains 234 attribution records and currently reports zero VASP/flagged/sanctioned hits. The frontend therefore does **not** invent a risk score or fake VASP matches.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Team integration

Later, Person 3 can replace the local JSON import with API calls. Keep the graph mapping in `src/graphData.js`; the UI should continue to consume the normalized graph structure.

### Do not modify

Do not copy this into or refactor:

- `blockchain/`
- `attribution/`
- any Person 1/2 implementation

This folder is Person 4's isolated work.
