import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { Download, Maximize2, Minus, Plus, Search, Shield, Sun, Moon, RotateCcw, X } from 'lucide-react';
import btcData from './data/btc_output.json';
import attributionData from './data/attribution_output.json';
import { buildGraphElements, getAttribution, getNodeKind, shortenAddress, formatBtc } from './graphData';
import { exportReportPdf } from './report';

const SOURCE = btcData.source_wallet;

export default function App() {
  const graphRef = useRef(null);
  const cyRef = useRef(null);
  const [address, setAddress] = useState(SOURCE);
  const [selected, setSelected] = useState(null);
  const [traced, setTraced] = useState(true);
  const [dark, setDark] = useState(true);
  const [message, setMessage] = useState('');

  const graph = useMemo(
    () => buildGraphElements(btcData, attributionData, address),
    [address]
  );

  const stats = useMemo(() => {
    const attrs = Object.values(attributionData.attributions || {});
    const vasp = attrs.filter(a => a.vasp_name).length;
    const flagged = attrs.filter(a => ['flagged','mixer','sanctioned'].includes(String(a.entity_type || '').toLowerCase())).length;
    return {
      wallets: btcData.nodes?.length ?? 0,
      transfers: btcData.edges?.length ?? 0,
      transactions: btcData.trace_metadata?.transaction_count ?? btcData.edges?.length ?? 0,
      vasp,
      flagged,
      depth: btcData.trace_metadata?.max_depth ?? '—'
    };
  }, []);

  useEffect(() => {
    if (!graphRef.current) return;

    const cy = cytoscape({
      container: graphRef.current,
      elements: graph,
      layout: {
  name: 'cose',
  animate: false,
  randomize: true,

  nodeRepulsion: 120000,
  idealEdgeLength: 120,
  edgeElasticity: 0.15,

  nestingFactor: 0.8,
  gravity: 0.15,

  numIter: 2500,

  tile: true,
  tilingPaddingVertical: 80,
  tilingPaddingHorizontal: 80
}
      minZoom: 0.12,
      maxZoom: 5,
      wheelSensitivity: 0.18,
      style: [
        {
          selector:'node',
          style:{
            'background-color':'data(color)',
            'width':'data(size)',
            'height':'data(size)',
            'border-width':'data(borderWidth)',
            'border-color':'data(border)',
            'label':'',
            'opacity':0.9
          }
        },
        {
          selector:'node[source="true"]',
          style:{ 'width':34, 'height':34, 'border-width':3, 'opacity':1, 'z-index':20 }
        },
        {
          selector:'node[vasp="true"]',
          style:{ 'width':26, 'height':26, 'border-width':2.5, 'opacity':1, 'z-index':18 }
        },
        {
          selector:'edge',
          style:{
            'line-color':'data(edgeColor)',
            'width':'data(edgeWidth)',
            'curve-style':'bezier',
            'opacity':0.25,
            'target-arrow-shape':'triangle',
            'target-arrow-color':'data(edgeColor)',
            'arrow-scale':0.55
          }
        },
        {
          selector:'edge:selected',
          style:{ 'opacity':0.9, 'width':2.2 }
        },
        {
          selector:'.faded',
          style:{ 'opacity':0.08 }
        },
        {
          selector:'.highlight',
          style:{ 'opacity':1 }
        }
      ]
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
    return () => cy.destroy();
  }, [graph]);

  function traceWallet() {
    const value = address.trim();
    if (!value) return;
    setTraced(false);
    setMessage('Demo trace loaded from the supplied JSON dataset.');
    setTimeout(() => {
      setTraced(true);
      setMessage('');
    }, 350);
  }

  function fitGraph() { cyRef.current?.fit(undefined, 34); }
  function zoomIn() { cyRef.current?.zoom(cyRef.current.zoom()*1.25); }
  function zoomOut() { cyRef.current?.zoom(cyRef.current.zoom()/1.25); }
  function resetLayout() {
    cyRef.current?.layout({name:'cose', animate:false, fit:true, padding:34, nodeRepulsion:7800, idealEdgeLength:105, edgeElasticity:0.35, gravity:0.22, numIter:900}).run();
  }

  async function downloadReport() {
    await exportReportPdf({
      sourceWallet: address || SOURCE,
      stats,
      attribution: selected ? getAttribution(attributionData, selected.address) : null
    });
  }

  const selectedAttr = selected ? getAttribution(attributionData, selected.address) : null;

  return (
    <div className={dark ? 'app dark' : 'app light'}>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark"><Shield size={21}/></div>
          <div><strong>CryptoShield</strong><span>Fraud Investigation System</span></div>
        </div>
        <div className="topActions">
          <button className="iconBtn" onClick={()=>setDark(v=>!v)} title="Toggle theme">{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
          <span className="role">Investigator <small>Cyber Crime Unit</small></span>
        </div>
      </header>

      <main className="workspace">
        <section className="searchPanel panel">
          <div className="eyebrow">WALLET TRACE</div>
          <label>Enter Victim / Suspect Wallet Address</label>
          <div className="searchRow">
            <div className="inputWrap"><Search size={18}/><input value={address} onChange={e=>setAddress(e.target.value)} onKeyDown={e=>e.key==='Enter'&&traceWallet()} placeholder="Bitcoin wallet address"/></div>
            <button className="traceBtn" onClick={traceWallet}><Search size={17}/> TRACE WALLET</button>
          </div>
          <div className="dataNote">Prototype mode · reads <b>btc_output.json</b> + <b>attribution_output.json</b> · no frontend history stored</div>
        </section>

        <section className="contentGrid">
          <div className="graphPanel panel">
            <div className="panelHead">
              <div><h2>Transaction Network</h2><span>{stats.wallets} wallets · {stats.transfers} transfers · depth {stats.depth}</span></div>
              <div className="legend">
                <i className="dot source"/> Source
                <i className="dot vasp"/> VASP
                <i className="dot wallet"/> Wallet
              </div>
            </div>
            <div className="graphCanvas">
              <div ref={graphRef} className="cy"/>
              <div className="graphControls">
                <button onClick={fitGraph} title="Fit graph"><Maximize2 size={17}/></button>
                <button onClick={zoomIn} title="Zoom in"><Plus size={17}/></button>
                <button onClick={zoomOut} title="Zoom out"><Minus size={17}/></button>
                <button onClick={resetLayout} title="Re-layout"><RotateCcw size={16}/></button>
              </div>
              <div className="graphHint">Click a node to inspect</div>
              {!traced && <div className="loading">Tracing…</div>}
            </div>
          </div>

          <aside className="reportPanel panel">
            <div className="panelHead"><div><div className="eyebrow">RESULT</div><h2>Investigation Report</h2></div></div>
            <div className="riskBox">
              <span>RISK SCORE</span>
              <strong>Pending</strong>
              <small>Risk engine result will appear here</small>
            </div>
            <div className="metric"><span>Wallets traced</span><b>{stats.wallets.toLocaleString()}</b></div>
            <div className="metric"><span>Transfers</span><b>{stats.transfers.toLocaleString()}</b></div>
            <div className="metric"><span>Transactions</span><b>{stats.transactions.toLocaleString()}</b></div>
            <div className="metric"><span>Flagged wallets</span><b>{stats.flagged}</b></div>
            <div className="metric"><span>VASP matches</span><b>{stats.vasp}</b></div>
            <div className="metric"><span>Trace depth</span><b>{stats.depth}</b></div>

            <div className="sourceBox">
              <span>TRACE SOURCE</span>
              <code>{shortenAddress(address, 18)}</code>
              <small>Bitcoin · CASE-001</small>
            </div>

            {selected && (
              <div className="selectedBox">
                <div className="selectedHead"><span>SELECTED NODE</span><button onClick={()=>setSelected(null)}><X size={15}/></button></div>
                <strong>{getNodeKind(selected)}</strong>
                <code>{shortenAddress(selected.address, 22)}</code>
                {selectedAttr?.vasp_name && <small>VASP: {selectedAttr.vasp_name}</small>}
                {selectedAttr?.confidence != null && <small>Attribution confidence: {(selectedAttr.confidence*100).toFixed(0)}%</small>}
              </div>
            )}

            <button className="downloadBtn" onClick={downloadReport}><Download size={17}/> DOWNLOAD REPORT (PDF)</button>
            <p className="honesty">Risk and attribution values are displayed from team outputs. The frontend does not invent or calculate a fraud score.</p>
          </aside>
        </section>
      </main>
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
