export default async function handler(req, res) {
  try {
    const url = 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    if (!response.ok) {
      throw new Error(`Naver API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(200).json(data);
  } catch (error) {
    console.error('KOSPI API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
