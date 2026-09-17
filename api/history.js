export default async function handler(req, res) {
  const { code, count = '30' } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing stock code' });
  }

  try {
    const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    if (!response.ok) {
      throw new Error(`Naver History API responded with status: ${response.status}`);
    }
    
    // Naver returns EUC-KR XML for this endpoint
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const text = decoder.decode(buffer);
    
    // Parse XML using RegExp to avoid heavy dependencies (valid since structure is simple & fixed)
    const history = [];
    const itemRegex = /<item\s+data="([^"]+)"/g;
    let match;
    
    while ((match = itemRegex.exec(text)) !== null) {
      const parts = match[1].split('|');
      history.push({
        date: parts[0],
        open: parseFloat(parts[1]),
        high: parseFloat(parts[2]),
        low: parseFloat(parts[3]),
        close: parseFloat(parts[4]),
        volume: parseFloat(parts[5])
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(200).json({ history });
  } catch (error) {
    console.error(`History API Error (${code}):`, error);
    res.status(500).json({ error: error.message });
  }
}
