// ---------------------------------------------------------------------------
// graphData.js
// Builds Cytoscape elements (with deterministic preset positions) directly
// from btc_output.json (Person 1) and attribution_output.json (Person 2).
// No relationships, nodes, or classifications are invented: every edge is a
// real transfer, every position is derived from real degree/cluster signals.
// ---------------------------------------------------------------------------

export function getAttribution(data, address) {
  if (!address) return null;
  return data?.attributions?.[`bitcoin:${address}`] ||
         data?.attributions?.[address] ||
         null;
}

export function shortenAddress(address = '', max = 18) {
  if (address.length <= max) return address;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${address.slice(0, left)}...${address.slice(-right)}`;
}

export function formatBtc(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `${n < 0.001 ? n.toFixed(8) : n.toFixed(6)} BTC`;
}

export function getNodeKind(node) {
  if (node?.kind === 'source') return 'Source / suspect wallet';
  if (node?.kind === 'vasp') return 'VASP / Exchange';
  if (node?.kind === 'flagged') return 'Flagged wallet';
  if (node?.kind === 'clustered') return 'Wallet (linked cluster)';
  return 'Wallet';
}

function colorFor(kind) {
  // Muted palette, intentionally low-vibrancy for a forensic UI.
  if (kind === 'source') return '#c4565c';
  if (kind === 'vasp') return '#4f9e83';
  if (kind === 'flagged') return '#8a6bc9';
  if (kind === 'clustered') return '#c99a4a';
  return '#69788a';
}

function borderFor(kind) {
  if (kind === 'source') return '#ef9a9e';
  if (kind === 'vasp') return '#8fd9bd';
  if (kind === 'flagged') return '#b9a0e8';
  if (kind === 'clustered') return '#e6bd7a';
  return '#8a97a6';
}

// Deterministic string -> [0,1) hash. Used only for small positional jitter
// so the layout looks organic but never shuffles between reloads/demos.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Builds address -> cluster_id map for clusters that actually contain more
// than one wallet (i.e. Person 2's engine linked them via a common-input /
// clustering heuristic). Singleton clusters carry no visual meaning here.
function buildClusterMap(attribution) {
  const map = new Map();
  const clusters = attribution?.clusters || [];
  for (const c of clusters) {
    if (!c || (c.member_count ?? c.members?.length ?? 0) <= 1) continue;
    for (const memberId of c.members || []) {
      const addr = String(memberId).includes(':') ? String(memberId).split(':').pop() : memberId;
      map.set(addr, c.cluster_id);
    }
  }
  return map;
}

export function buildGraphElements(btc, attribution, sourceAddress) {
  const nodes = btc?.nodes || [];
  const edges = btc?.edges || [];
  const source = sourceAddress || btc?.source_wallet;

  // --- Real degree count: how many transfers touch each wallet -----------
  const degree = new Map();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }

  const clusterMap = buildClusterMap(attribution);

  // --- Classify + measure every node --------------------------------------
  const enriched = nodes.map((n) => {
    const attr = getAttribution(attribution, n.address);
    const entity = String(attr?.entity_type || '').toLowerCase();
    const isVasp = Boolean(attr?.vasp_name);
    const isFlagged = entity.includes('flag') || entity.includes('mixer') || entity.includes('sanction');
    const isSource = n.address === source || n.address === btc?.source_wallet;
    const clusterId = clusterMap.get(n.address) || null;
    const isClustered = Boolean(clusterId) && !isSource;
    const kind = isSource ? 'source' : isVasp ? 'vasp' : isFlagged ? 'flagged' : isClustered ? 'clustered' : 'wallet';
    const deg = degree.get(n.address) || 0;
    return { n, attr, isVasp, isFlagged, isSource, isClustered, clusterId, kind, deg };
  });

  const sourceEntry = enriched.find(e => e.isSource);
  const others = enriched.filter(e => !e.isSource);

  // --- Ring assignment by real transaction-repeat count (degree) ---------
  // Wallets that transacted with the source more than once sit in inner
  // rings (structurally more significant); one-off wallets sit outermost.
  // This never creates or removes an edge -- it only positions real nodes.
  const sortedByDegree = [...others].sort((a, b) => b.deg - a.deg);
  const N = sortedByDegree.length || 1;
  const ringOf = new Map();
  sortedByDegree.forEach((e, i) => {
    const pct = i / N;
    let ring;
    if (pct < 0.05) ring = 0;
    else if (pct < 0.20) ring = 1;
    else if (pct < 0.50) ring = 2;
    else ring = 3;
    ringOf.set(e.n.address, ring);
  });
  const ringRadius = [130, 235, 355, 490];

  // --- Angular ordering by attribution cluster ----------------------------
  // Nodes Person 2's engine linked into the same cluster sit adjacent in
  // angle (regardless of ring), reading as a coherent branch/group without
  // altering any edge.
  const angleSorted = [...others].sort((a, b) => {
    const ka = a.clusterId || `solo:${a.n.address}`;
    const kb = b.clusterId || `solo:${b.n.address}`;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.n.address < b.n.address ? -1 : 1;
  });
  const angleOf = new Map();
  const M = angleSorted.length;
  const ARC_START = -95, ARC_END = 95; // degrees; 0 = due right of the source
  angleSorted.forEach((e, i) => {
    const frac = M <= 1 ? 0.5 : i / (M - 1);
    const jitter = (hash01(e.n.address + ':a') - 0.5) * 5; // +/-2.5deg, deterministic
    angleOf.set(e.n.address, ARC_START + frac * (ARC_END - ARC_START) + jitter);
  });

  const SOURCE_X = -420, SOURCE_Y = 0;

  const nodeElements = enriched.map((e) => {
    const { n, kind, isSource, isClustered, clusterId, deg } = e;
    const size = isSource
      ? 32
      : kind === 'vasp'
        ? 24
        : kind === 'flagged'
          ? 20
          : Math.max(4, Math.min(18, 4 + Math.log2(deg + 1) * 3.2)) + (isClustered ? 2 : 0);

    let x, y;
    if (isSource) {
      x = SOURCE_X; y = SOURCE_Y;
    } else {
      const ring = ringOf.get(n.address) ?? 3;
      const radius = ringRadius[ring] + (hash01(n.address + ':r') - 0.5) * 46;
      const angleDeg = angleOf.get(n.address) ?? 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      x = SOURCE_X + radius * Math.cos(angleRad);
      y = SOURCE_Y + radius * Math.sin(angleRad);
    }

    return {
      data: {
        id: n.id,
        address: n.address,
        kind,
        color: colorFor(kind),
        border: borderFor(kind),
        borderWidth: kind === 'source' || kind === 'vasp' || kind === 'flagged' ? 2.4 : kind === 'clustered' ? 1.4 : 0.7,
        size,
        source: String(isSource),
        vasp: String(kind === 'vasp'),
        flagged: String(kind === 'flagged'),
        clustered: String(isClustered),
        clusterId: clusterId || '',
        degree: deg,
        label: shortenAddress(n.address, 13)
      },
      position: { x, y }
    };
  });

  const nodeIdSet = new Set(nodes.map(n => n.id));
  const edgeElements = edges
    .filter(e => {
      const c = e.chain || 'bitcoin';
      return nodeIdSet.has(`${c}:${e.from}`) && nodeIdSet.has(`${c}:${e.to}`);
    })
    .map((e, i) => {
      const chain = e.chain || 'bitcoin';
      return {
        data: {
          id: e.id || `edge-${i}`,
          source: `${chain}:${e.from}`,
          target: `${chain}:${e.to}`,
          amount: e.amount,
          token: e.token,
          timestamp: e.timestamp,
          tx_hash: e.tx_hash,
          edgeColor: '#59636f',
          edgeWidth: Math.max(0.45, Math.min(2.2, Math.log10(Number(e.amount) + 1) + 0.6))
        }
      };
    });

  return [...nodeElements, ...edgeElements];
}

// Real, non-fabricated cluster stats for the report panel.
export function getClusterStats(attribution) {
  const clusters = attribution?.clusters || [];
  const linked = clusters.filter(c => (c.member_count ?? c.members?.length ?? 0) > 1);
  const linkedWallets = linked.reduce((sum, c) => sum + (c.member_count ?? c.members?.length ?? 0), 0);
  return { linkedClusterCount: linked.length, linkedWalletCount: linkedWallets };
}

// Honest trace-completeness info straight from trace_metadata -- never
// implies a deeper trace happened than actually did.
export function getTraceCompleteness(btc) {
  const meta = btc?.trace_metadata || {};
  const depthByNode = meta?.bfs?.depth_by_node || {};
  const values = Object.values(depthByNode);
  const reached = values.length ? Math.max(...values) : null;
  return {
    configuredMaxDepth: meta.max_depth ?? null,
    depthReached: reached,
    truncated: Boolean(meta.truncated),
    truncationReasons: meta.truncation_reasons || []
  };
}
