import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import {
  Download,
  Maximize2,
  Minus,
  Plus,
  Search,
  Shield,
  Sun,
  Moon,
  RotateCcw,
  X,
} from "lucide-react";

import btcData from "./data/btc_output.json";
import attributionData from "./data/attribution_output.json";

import {
  buildGraphElements,
  getAttribution,
  getNodeKind,
  shortenAddress,
} from "./graphData";

import { exportReportPdf } from "./report";

const SOURCE = btcData.source_wallet;

export default function App() {
  const graphRef = useRef(null);
  const cyRef = useRef(null);

  const [address, setAddress] = useState(SOURCE);
  const [selected, setSelected] = useState(null);
  const [traced, setTraced] = useState(true);
  const [dark, setDark] = useState(true);
  const [message, setMessage] = useState("");

  const graph = useMemo(() => {
    return buildGraphElements(
      btcData,
      attributionData,
      address || SOURCE
    );
  }, [address]);

  const stats = useMemo(() => {
    const attrs = Object.values(attributionData.attributions || {});

    const vasp = attrs.filter(
      (a) => a && a.vasp_name
    ).length;

    const flagged = attrs.filter((a) => {
      const entity = String(a?.entity_type || "").toLowerCase();

      return (
        entity.includes("flag") ||
        entity.includes("mixer") ||
        entity.includes("sanction")
      );
    }).length;

    return {
      wallets: btcData.nodes?.length ?? 0,
      transfers: btcData.edges?.length ?? 0,
      transactions:
        btcData.trace_metadata?.transaction_count ??
        btcData.edges?.length ??
        0,
      vasp,
      flagged,
      depth: btcData.trace_metadata?.max_depth ?? "—",
    };
  }, []);

  useEffect(() => {
    if (!graphRef.current) return;

    const cy = cytoscape({
      container: graphRef.current,

      elements: graph,

      minZoom: 0.12,
      maxZoom: 5,
      wheelSensitivity: 0.18,

      style: [
        {
          selector: "node",

          style: {
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",

            "border-width": "data(borderWidth)",
            "border-color": "data(border)",

            label: "",
            opacity: 0.78,

            "overlay-opacity": 0,
          },
        },

        {
          selector: 'node[kind="source"]',

          style: {
            width: 34,
            height: 34,

            "border-width": 3,
            "border-color": "#d98a8f",

            opacity: 1,

            "z-index": 30,
          },
        },

        {
          selector: 'node[kind="vasp"]',

          style: {
            width: 25,
            height: 25,

            "border-width": 2.5,
            "border-color": "#83c7b2",

            opacity: 1,

            "z-index": 25,
          },
        },

        {
          selector: 'node[kind="flagged"]',

          style: {
            width: 20,
            height: 20,

            "border-width": 2,
            "border-color": "#aa8ed0",

            opacity: 1,

            "z-index": 24,
          },
        },

        {
          selector: "edge",

          style: {
            "line-color": "data(edgeColor)",

            width: "data(edgeWidth)",

            "curve-style": "bezier",

            opacity: 0.2,

            "target-arrow-shape": "triangle",

            "target-arrow-color": "data(edgeColor)",

            "arrow-scale": 0.45,
          },
        },

        {
          selector: "edge:selected",

          style: {
            opacity: 0.85,
            width: 2,
          },
        },

        {
          selector: ".faded",

          style: {
            opacity: 0.04,
          },
        },

        {
          selector: ".highlight",

          style: {
            opacity: 1,
          },
        },
      ],

      layout: {
        name: "cose",

        animate: false,

        fit: true,

        padding: 70,

        nodeRepulsion: 18000,

        idealEdgeLength: 95,

        edgeElasticity: 0.12,

        nestingFactor: 0.8,

        gravity: 0.08,

        numIter: 1800,

        randomize: true,

        componentSpacing: 120,

        nodeOverlap: 20,
      },
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;

      const data = node.data();

      setSelected(data);

      cy.elements().removeClass("highlight faded");

      node.addClass("highlight");

      const neighborhood = node.closedNeighborhood();

      cy.elements()
        .difference(neighborhood)
        .addClass("faded");
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        setSelected(null);

        cy.elements().removeClass(
          "highlight faded"
        );
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  function traceWallet() {
    const value = address.trim();

    if (!value) {
      setMessage("Enter a wallet address.");
      return;
    }

    setTraced(false);

    setMessage(
      "Demo trace loaded from the supplied blockchain dataset."
    );

    setTimeout(() => {
      setTraced(true);
      setMessage("");
    }, 500);
  }

  function fitGraph() {
    if (!cyRef.current) return;

    cyRef.current.fit(
      cyRef.current.elements(),
      70
    );
  }

  function zoomIn() {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    cy.zoom({
      level: cy.zoom() * 1.25,

      renderedPosition: {
        x: cy.width() / 2,
        y: cy.height() / 2,
      },
    });
  }

  function zoomOut() {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    cy.zoom({
      level: cy.zoom() / 1.25,

      renderedPosition: {
        x: cy.width() / 2,
        y: cy.height() / 2,
      },
    });
  }

  function resetLayout() {
    if (!cyRef.current) return;

    cyRef.current
      .layout({
        name: "cose",

        animate: false,

        fit: true,

        padding: 70,

        nodeRepulsion: 18000,

        idealEdgeLength: 95,

        edgeElasticity: 0.12,

        nestingFactor: 0.8,

        gravity: 0.08,

        numIter: 1800,

        randomize: true,

        componentSpacing: 120,

        nodeOverlap: 20,
      })
      .run();
  }

  async function downloadReport() {
    await exportReportPdf({
      sourceWallet: address || SOURCE,

      stats,

      attribution: selected
        ? getAttribution(
            attributionData,
            selected.address
          )
        : null,
    });
  }

  const selectedAttr = selected
    ? getAttribution(
        attributionData,
        selected.address
      )
    : null;

  return (
    <div
      className={
        dark ? "app dark" : "app light"
      }
    >
      {/* ================= HEADER ================= */}

      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            <Shield size={21} />
          </div>

          <div>
            <strong>CryptoShield</strong>

            <span>
              Fraud Investigation System
            </span>
          </div>
        </div>

        <div className="topActions">
          <button
            className="iconBtn"
            onClick={() =>
              setDark((value) => !value)
            }
            title="Toggle theme"
          >
            {dark ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>

          <span className="role">
            Investigator

            <small>
              Cyber Crime Unit
            </small>
          </span>
        </div>
      </header>

      {/* ================= MAIN ================= */}

      <main className="workspace">

        {/* ================= SEARCH ================= */}

        <section className="searchPanel panel">
          <div className="eyebrow">
            WALLET TRACE
          </div>

          <label>
            Enter Victim / Suspect Wallet Address
          </label>

          <div className="searchRow">

            <div className="inputWrap">
              <Search size={18} />

              <input
                value={address}
                onChange={(event) =>
                  setAddress(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    traceWallet();
                  }
                }}
                placeholder="Bitcoin wallet address"
              />
            </div>

            <button
              className="traceBtn"
              onClick={traceWallet}
            >
              <Search size={17} />

              TRACE WALLET
            </button>

          </div>

          <div className="dataNote">
            Prototype mode · reads{" "}
            <b>btc_output.json</b> +{" "}
            <b>attribution_output.json</b> · no
            frontend history stored
          </div>
        </section>

        {/* ================= CONTENT ================= */}

        <section className="contentGrid">

          {/* ================= GRAPH ================= */}

          <div className="graphPanel panel">

            <div className="panelHead">

              <div>
                <h2>
                  Transaction Network
                </h2>

                <span>
                  {stats.wallets.toLocaleString()}{" "}
                  wallets ·{" "}
                  {stats.transfers.toLocaleString()}{" "}
                  transfers · depth{" "}
                  {stats.depth}
                </span>
              </div>

              <div className="legend">

                <i className="dot source" />
                Source

                <i className="dot vasp" />
                VASP

                <i className="dot wallet" />
                Wallet

              </div>

            </div>

            <div className="graphCanvas">

              <div
                ref={graphRef}
                className="cy"
              />

              {/* GRAPH CONTROLS */}

              <div className="graphControls">

                <button
                  onClick={fitGraph}
                  title="Fit graph"
                >
                  <Maximize2 size={17} />
                </button>

                <button
                  onClick={zoomIn}
                  title="Zoom in"
                >
                  <Plus size={17} />
                </button>

                <button
                  onClick={zoomOut}
                  title="Zoom out"
                >
                  <Minus size={17} />
                </button>

                <button
                  onClick={resetLayout}
                  title="Re-layout graph"
                >
                  <RotateCcw size={16} />
                </button>

              </div>

              <div className="graphHint">
                Click a node to inspect
              </div>

              {!traced && (
                <div className="loading">
                  Tracing…
                </div>
              )}

            </div>
          </div>

          {/* ================= REPORT ================= */}

          <aside className="reportPanel panel">

            <div className="panelHead">

              <div>
                <div className="eyebrow">
                  RESULT
                </div>

                <h2>
                  Investigation Report
                </h2>
              </div>

            </div>

            {/* RISK */}

            <div className="riskBox">

              <span>
                RISK SCORE
              </span>

              <strong>
                Pending
              </strong>

              <small>
                Risk engine result will appear
                here
              </small>

            </div>

            {/* METRICS */}

            <div className="metric">
              <span>
                Wallets traced
              </span>

              <b>
                {stats.wallets.toLocaleString()}
              </b>
            </div>

            <div className="metric">
              <span>
                Transfers
              </span>

              <b>
                {stats.transfers.toLocaleString()}
              </b>
            </div>

            <div className="metric">
              <span>
                Transactions
              </span>

              <b>
                {stats.transactions.toLocaleString()}
              </b>
            </div>

            <div className="metric">
              <span>
                Flagged wallets
              </span>

              <b>
                {stats.flagged}
              </b>
            </div>

            <div className="metric">
              <span>
                VASP matches
              </span>

              <b>
                {stats.vasp}
              </b>
            </div>

            <div className="metric">
              <span>
                Trace depth
              </span>

              <b>
                {stats.depth}
              </b>
            </div>

            {/* TRACE SOURCE */}

            <div className="sourceBox">

              <span>
                TRACE SOURCE
              </span>

              <code>
                {shortenAddress(
                  address,
                  18
                )}
              </code>

              <small>
                Bitcoin · CASE-001
              </small>

            </div>

            {/* SELECTED NODE */}

            {selected && (
              <div className="selectedBox">

                <div className="selectedHead">

                  <span>
                    SELECTED NODE
                  </span>

                  <button
                    onClick={() =>
                      setSelected(null)
                    }
                    title="Close"
                  >
                    <X size={15} />
                  </button>

                </div>

                <strong>
                  {getNodeKind(selected)}
                </strong>

                <code>
                  {shortenAddress(
                    selected.address,
                    22
                  )}
                </code>

                {selectedAttr?.vasp_name && (
                  <small>
                    VASP:{" "}
                    {selectedAttr.vasp_name}
                  </small>
                )}

                {selectedAttr?.confidence !=
                  null && (
                  <small>
                    Attribution confidence:{" "}
                    {(
                      selectedAttr.confidence *
                      100
                    ).toFixed(0)}
                    %
                  </small>
                )}

              </div>
            )}

            {/* DOWNLOAD */}

            <button
              className="downloadBtn"
              onClick={downloadReport}
            >
              <Download size={17} />

              DOWNLOAD REPORT (PDF)
            </button>

            <p className="honesty">
              Risk and attribution values are
              displayed from team outputs. The
              frontend does not invent or
              calculate a fraud score.
            </p>

          </aside>

        </section>
      </main>

      {/* ================= TOAST ================= */}

      {message && (
        <div className="toast">
          {message}
        </div>
      )}
    </div>
  );
}
