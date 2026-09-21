export default async function handler(req, res) {
  const { bazi, ohang, todayBazi, todayOhang } = req.query;

  if (!bazi) {
    return res.status(400).json({ error: 'Missing bazi parameter' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in environment variables' });
  }

  const ohang_section = ohang ? `\n[명식 오행 분포(목/화/토/금/수)]: ${ohang}` : '';
  let today_section = '';
  if (todayBazi) {
    today_section = `\n[오늘의 일진 사주]: ${todayBazi}`;
  }
  if (todayOhang) {
    today_section += `\n[오늘의 일진 오행 분포(목/화/토/금/수)]: ${todayOhang}`;
  }

  const prompt = `
당신은 전문 명리학자입니다.
다음 정보를 바탕으로 오늘의 운세와 오행 분석을 작성해주세요.

[사용자 생년월일 사주(명식)]: ${bazi}${ohang_section}
${today_section}

위 명식과 오늘의 일진이 만나 어떤 기운의 교류가 일어나는지를 명리학적으로 분석하여, 아래 JSON 형식으로 반환하세요.
- 운세는 명식의 오행과 오늘 일진의 오행이 어떻게 상생/상극 작용하는지를 구체적으로 반영할 것
- 오행 강점 분석은 명식(생년월일 사주)의 오행 분포를 기준으로 작성할 것
- 오늘의 일진 오행 수치(목/화/토/금/수)를 운세 분석에 반드시 정확하게 반영할 것

반드시 다음 JSON 형식으로만 반환하세요:
{
  "total": "총운 설명 (3~4문장, 명식과 오늘 일진의 오행 교류 반영)",
  "wealth": "재물운 설명 (3~4문장)",
  "love": "애정운 설명 (3~4문장)",
  "career": "직장/학업운 설명 (3~4문장)",
  "health": "건강운 설명 (3~4문장)",
  "ohang_strength": "오행 강점 요약: 명식 기준으로 이 사주의 중심 오행 특성과 강점 (4~5문장)",
  "ohang_advice": "오행 보완점 및 조언: 명식에서 부족한 오행과 실질적인 생활 조언 (4~5문장)"
}
결과는 오직 유효한 JSON 형식으로만 반환해야 합니다. 다른 말은 덧붙이지 마세요.
`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (responseText.startsWith('```json')) {
      responseText = responseText.substring(7);
    }
    if (responseText.startsWith('```')) {
      responseText = responseText.substring(3);
    }
    if (responseText.endsWith('```')) {
      responseText = responseText.substring(0, responseText.length - 3);
    }
    responseText = responseText.trim();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(responseText);
  } catch (error) {
    console.error('Saju API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
