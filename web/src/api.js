async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('Content-Type') || '';
  const text = await res.text();
  if (!contentType.includes('application/json')) {
    if (text.trim().startsWith('<')) {
      throw new Error(
        'Server returned HTML instead of JSON. Is the API server running? ' +
        'Start it with: npm run server (from project root) or ./web.sh'
      );
    }
    throw new Error(`Unexpected response: ${text.slice(0, 100)}`);
  }
  return JSON.parse(text);
}

export async function analyzeTransaction(fixture) {
  return fetchJson('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fixture),
  });
}

export async function analyzeBlock(blkData, revData, xorData) {
  return fetchJson('/api/analyze_block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blk_data: blkData, rev_data: revData, xor_data: xorData }),
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
