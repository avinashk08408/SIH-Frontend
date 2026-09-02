import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import {
  Download, Maximize2, Minus, Plus, Search, Shield, Sun, Moon, RotateCcw, X,
  Wallet as WalletIcon, ArrowLeftRight, Flag, Landmark, Layers, Radar, Info
} from 'lucide-react';
import btcData from './data/btc_output.json';
import attributionData from './data/attribution_output.json';
import {
  buildGraphElements, getAttribution, getNodeKind, shortenAddress,
  getClusterStats, getTraceCompleteness
} from './graphData';
import { exportReportPdf } from './report';

const SOURCE = btcData.source_wallet;

const CY_STYLE = [
  { selector: 'node', style: {
      'background-color': 'data(color)',
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 'data(borderWidth)',
      'border-color': 'data(border)',
      'label': '',
      'opacity': 0.92
  }},
  { selector: 'node[source="true"]', style: { 'width': 34, 'height': 34, 'border-width': 3, 'opacity': 1, 'z-index': 30,
      'shadow-blur': 18, 'shadow-color': '#c4565c', 'shadow-opacity': 0.55, 'shadow-offset-x': 0, 'shadow-offset-y': 0 } },
  { selector: 'node[vasp="true"]', style: { 'width': 26, 'height': 26, 'border-width': 2.6, 'opacity': 1, 'z-index': 22,
      'shadow-blur': 12, 'shadow-color': '#4f9e83', 'shadow-opacity': 0.4 } },
  { selector: 'node[flagged="true"]', style: { 'width': 22, 'height': 22, 'border-width': 2.4, 'opacity': 1, 'z-index': 21,
      'shadow-blur': 10, 'shadow-color': '#8a6bc9', 'shadow-opacity': 0.4 } },
  { selector: 'node[clustered="true"]', style: { 'opacity': 1, 'z-index': 12 } },
  { selector: 'edge', style: {
      'line-color': 'data(edgeColor)',
      'width': 'data(edgeWidth)',
      'curve-style': 'bezier',
      'opacity': 0.22,
      'target-arrow-shape': 'triangle',
      'target-arrow-color': 'data(edgeColor)',
      'arrow-scale': 0.5
  }},
  { selector: 'edge:selected', style: { 'opacity': 0.9, 'width': 2.2 } },
  { selector: '.faded', style: { 'opacity': 0.06 } },
  { selector: '.highlight', style: { 'opacity': 1 } }
];

function RiskGauge({ pending = true, value = null }) {
  // Semi-donut gauge. Pending state renders a neutral, uncoloured arc --
  // we never synthesize a numeric score when the risk engine hasn't run.
  const r = 54, cx = 70, cy = 70, stroke = 11;
  const circumference = Math.PI * r;
  const pct = pending ? 1 : Math.max(0, Math.min(1, (value ?? 0) / 100));
  return (
    <svg viewBox="0 0 140 88" width="180" height="112">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#1c2733" strokeWidth={stroke} strokeLinecap="round" />
      {!pending && (
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#8a6bc9" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`} />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={pending ? 15 : 26} fill={pending ? '#8b96a4' : '#e7ebf0'} fontWeight="700">
        {pending ? 'PENDING' : Math.round(value)}
      </text>
      {!pending && <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#7f8b9a">/100</text>}
    </svg>
  );
}

export default function App() {
  const graphRef = useRef(null);
  const miniRef = useRef(null);
  const cyRef = useRef(null);
  const miniCyRef = useRef(null);
  const [address, setAddress] = useState(SOURCE);
  const [selected, setSelected] = useState(null);
  const [traced, setTraced] = useState(true);
  const [dark, setDark] = useState(true);
  const [message, setMessage] = useState('');
  const [lastUpdated] = useState(() => new Date());

  const graph = useMemo(
    () => buildGraphElements(btcData, attributionData, address),
    [address]
  );

  const clusterStats = useMemo(() => getClusterStats(attributionData), []);
  const completeness = useMemo(() => getTraceCompleteness(btcData), []);

  const stats = useMemo(() => {
    const attrs = Object.values(attributionData.attributions || {});
    const vasp = attrs.filter(a => a.vasp_name).length;
    const flagged = attrs.filter(a => ['flagged', 'mixer', 'sanctioned'].includes(String(a.entity_type || '').toLowerCase())).length;
    return {
      wallets: btcData.nodes?.length ?? 0,
      transfers: btcData.edges?.length ?? 0,
      transactions: btcData.trace_metadata?.transaction_count ?? btcData.edges?.length ?? 0,
      vasp,
      flagged,
      depth: btcData.trace_metadata?.max_depth ?? '\u2014'
    };
  }, []);

  useEffect(() => {
    if (!graphRef.current) return;

    const cy = cytoscape({
      container: graphRef.current,
      elements: graph,
      layout: { name: 'preset', fit: true, padding: 40 },
      minZoom: 0.12,
      maxZoom: 5,
      wheelSensitivity: 0.18,
      style: CY_STYLE
    });

    cy.on('tap', 'node', evt => {
      const d = evt.target.data();
      setSelected(d);
      cy.elements().removeClass('highlight faded');
      evt.target.addClass('highlight');
      const neighborhood = evt.target.closedNeighborhood();
      cy.elements().difference(neighborhood).addClass('faded');
    });

    cy.on('tap', evt => {
      if (evt.target === cy) {
        setSelected(null);
        cy.elements().removeClass('highlight faded');
      }
    });

    cyRef.current = cy;

    let miniCy = null;
    if (miniRef.current) {
      miniCy = cytoscape({
        container: miniRef.current,
        elements: graph,
        layout: { name: 'preset', fit: true, padding: 12 },
        style: CY_STYLE,
        userZoomingEnabled: false,
        userPanningEnabled: false,
        boxSelectionEnabled: false,
        autoungrabify: true
      });
      miniCyRef.current = miniCy;
    }

    return () => { cy.destroy(); miniCy?.destroy(); };
  }, [graph]);

  function traceWallet() {
    const value = address.trim();
    if (!value) return;
    setTraced(false);
    setMessage('Demo trace loaded from the supplied JSON dataset.');
    setTimeout(() => { setTraced(true); setMessage(''); }, 350);
  }

  function fitGraph() { cyRef.current?.fit(undefined, 34); }
  function zoomIn() { cyRef.current?.zoom(cyRef.current.zoom() * 1.25); }
  function zoomOut() { cyRef.current?.zoom(cyRef.current.zoom() / 1.25); }
  function resetLayout() { cyRef.current?.layout({ name: 'preset', fit: true, padding: 40 }).run(); }

  async function downloadReport() {
    await exportReportPdf({
      sourceWallet: address || SOURCE,
      stats,
      clusterStats,
      completeness,
      attribution: selected ? getAttribution(attributionData, selected.address) : null
    });
  }

  const selectedAttr = selected ? getAttribution(attributionData, selected.address) : null;

  return (
    <div className={dark ? 'app dark' : 'app light'}>
      <div className="appShell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brandMark"><Shield size={19} /></div>
            <div><strong>CryptoShield</strong><span>Fraud Investigation System</span></div>
          </div>
          <nav className="sideNav">
            <div className="navItem active"><Search size={15} /> Investigation</div>
          </nav>
          <div className="sideFooter">
            <div className="statusRow"><i className="statusDot" /> System Status<span>All systems operational</span></div>
            <div className="statusRow muted">Last updated<span>{lastUpdated.toLocaleString()}</span></div>
          </div>
        </aside>

        <main className="mainArea">
          <div className="topRow">
            <div />
            <div className="topActions">
              <button className="iconBtn" onClick={() => setDark(v => !v)} title="Toggle theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
              <span className="role">Investigator <small>Cyber Crime Unit</small></span>
            </div>
          </div>

          <section className="searchPanel panel">
            <div className="eyebrow">WALLET TRACE</div>
            <label>Enter Victim / Suspect Wallet Address</label>
            <div className="searchRow">
              <div className="inputWrap"><Search size={18} /><input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === 'Enter' && traceWallet()} placeholder="Bitcoin wallet address" /></div>
              <button className="traceBtn" onClick={traceWallet}><Search size={17} /> TRACE WALLET</button>
            </div>
            <div className="dataNote">
              Prototype mode &middot; reads <b>btc_output.json</b> + <b>attribution_output.json</b> &middot; no frontend history stored
              {completeness.truncated && (
                <>
                  {' '}&middot; trace reached depth <b>{completeness.depthReached}</b> of configured max <b>{completeness.configuredMaxDepth}</b>
                  {' '}(truncated: {completeness.truncationReasons.join(', ') || 'unknown reason'})
                </>
              )}
            </div>
          </section>

          <section className="contentGrid">
            <div className="graphPanel panel">
              <div className="panelHead">
                <div><h2>Transaction Network Graph</h2><span>{stats.wallets} wallets &middot; {stats.transfers} transfers &middot; depth reached {completeness.depthReached ?? '\u2014'}</span></div>
                <div className="legend">
                  <i className="dot source" /> Source / Suspect
                  <i className="dot clustered" /> Linked cluster
                  <i className="dot wallet" /> Wallet
                  <i className="dot vasp" /> VASP / Exchange
                  <i className="dot flagged" /> Flagged / Mixer
                </div>
              </div>
              <div className="graphCanvas">
                <div ref={graphRef} className="cy" />
                <div className="graphControls">
                  <button onClick={fitGraph} title="Fit graph"><Maximize2 size={17} /></button>
                  <button onClick={zoomIn} title="Zoom in"><Plus size={17} /></button>
                  <button onClick={zoomOut} title="Zoom out"><Minus size={17} /></button>
                  <button onClick={resetLayout} title="Re-layout"><RotateCcw size={16} /></button>
                </div>
                <div className="miniMap"><div ref={miniRef} className="miniCy" /></div>
                <div className="graphHint">Click a node to inspect</div>
                {!traced && <div className="loading">Tracing&hellip;</div>}
              </div>
            </div>

            <aside className="reportPanel panel">
              <div className="panelHead"><div><div className="eyebrow">RESULT</div><h2>Investigation Report</h2></div></div>

              <div className="riskBox">
                <span>RISK SCORE</span>
                <RiskGauge pending />
                <small>Risk engine result will appear here</small>
              </div>

              <div className="metric"><span><ArrowLeftRight size={13} /> Transactions</span><b>{stats.transactions.toLocaleString()}</b></div>
              <div className="metric"><span><ArrowLeftRight size={13} /> Transfers</span><b>{stats.transfers.toLocaleString()}</b></div>
              <div className="metric"><span><WalletIcon size={13} /> Wallets traced</span><b>{stats.wallets.toLocaleString()}</b></div>
              <div className="metric"><span><Flag size={13} /> Flagged wallets</span><b>{stats.flagged}</b></div>
              <div className="metric"><span><Landmark size={13} /> VASP matches</span><b>{stats.vasp}</b></div>
              <div className="metric"><span><Layers size={13} /> Linked clusters</span><b>{clusterStats.linkedClusterCount} <small>({clusterStats.linkedWalletCount} wallets)</small></b></div>
              <div className="metric"><span><Radar size={13} /> Trace depth reached</span><b>{completeness.depthReached ?? '\u2014'} <small>/ max {completeness.configuredMaxDepth ?? '\u2014'}</small></b></div>

              <div className="sourceBox">
                <span>TRACE SOURCE</span>
                <code>{shortenAddress(address, 18)}</code>
                <small>Bitcoin &middot; CASE-001</small>
              </div>

              {selected && (
                <div className="selectedBox">
                  <div className="selectedHead"><span>SELECTED NODE</span><button onClick={() => setSelected(null)}><X size={15} /></button></div>
                  <strong>{getNodeKind(selected)}</strong>
                  <code>{shortenAddress(selected.address, 22)}</code>
                  <small>Transfers touching this wallet: {selected.degree ?? 0}</small>
                  {selected.clusterId && <small>Cluster ID: {selected.clusterId} (common-input linkage)</small>}
                  {selectedAttr?.vasp_name && <small>VASP: {selectedAttr.vasp_name}</small>}
                  {selectedAttr?.confidence != null && Number(selectedAttr.confidence) > 0 && <small>Attribution confidence: {(selectedAttr.confidence * 100).toFixed(0)}%</small>}
                </div>
              )}

              <button className="downloadBtn" onClick={downloadReport}><Download size={17} /> DOWNLOAD REPORT (PDF)</button>
              <p className="honesty"><Info size={11} /> Risk and attribution values are displayed from team outputs. The frontend does not invent or calculate a fraud score, VASP match, or flagged-wallet count.</p>
            </aside>
          </section>
        </main>
      </div>
      {message && <div className="toast">{message}</div>}
    </div>
  );
      }
