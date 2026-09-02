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
  return `${address.slice(0,left)}...${address.slice(-right)}`;
}

export function formatBtc(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `${n < 0.001 ? n.toFixed(8) : n.toFixed(6)} BTC`;
}

export function getNodeKind(node) {
  if (node?.kind === 'source') return 'Source wallet';
  if (node?.kind === 'vasp') return 'VASP / Exchange';
  if (node?.kind === 'flagged') return 'Flagged wallet';
  return 'Wallet';
}

function colorFor(kind) {
  // Muted palette: intentionally low-vibrancy for an investigation UI.
  if (kind === 'source') return '#b85b61';
  if (kind === 'vasp') return '#5d9f8d';
  if (kind === 'flagged') return '#8c6bb1';
  return '#788493';
}

export function buildGraphElements(btc, attribution, sourceAddress) {
  const nodes = btc?.nodes || [];
  const edges = btc?.edges || [];
  const source = sourceAddress || btc?.source_wallet;

  const nodeElements = nodes.map((n, i) => {
    const attr = getAttribution(attribution, n.address);
    const entity = String(attr?.entity_type || '').toLowerCase();
    const isVasp = Boolean(attr?.vasp_name);
    const isFlagged = entity.includes('flag') || entity.includes('mixer') || entity.includes('sanction');
    const isSource = n.address === source || n.address === btc?.source_wallet;
    const kind = isSource ? 'source' : isVasp ? 'vasp' : isFlagged ? 'flagged' : 'wallet';

    return {
      data: {
        id: n.id || `node-${i}`,
        address: n.address,
        kind,
        color: colorFor(kind),
        border: kind === 'source' ? '#d98a8f' : kind === 'vasp' ? '#83c7b2' : kind === 'flagged' ? '#aa8ed0' : '#9ca6b3',
        borderWidth: kind === 'source' || kind === 'vasp' || kind === 'flagged' ? 2 : 0.7,
        size: kind === 'source' ? 28 : kind === 'vasp' ? 22 : isFlagged ? 19 : (i % 7 === 0 ? 8 : 5),
        source: String(isSource),
        vasp: String(isVasp),
        label: shortenAddress(n.address, 13)
      }
    };
  });

  const nodeIds = new Set(nodes.map(n => n.address));
  const edgeElements = edges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e, i) => ({
      data: {
        id: e.id || `edge-${i}`,
        source: `bitcoin:${e.from}`,
        target: `bitcoin:${e.to}`,
        amount: e.amount,
        token: e.token,
        timestamp: e.timestamp,
        tx_hash: e.tx_hash,
        edgeColor: '#59636f',
        edgeWidth: Math.max(0.45, Math.min(2.2, Math.log10(Number(e.amount) + 1) + 0.6))
      }
    }));

  return [...nodeElements, ...edgeElements];
}
