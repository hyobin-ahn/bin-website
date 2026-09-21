export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, text } = req.body || {};

  if (!name || !text) {
    return res.status(400).json({ error: 'Missing name or text parameter in JSON body' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in environment variables' });
  }

  const prompt = `
당신은 주역(I Ching)에 정통한 동양철학자입니다.
다음은 주역의 '${name}' 괘의 원문(괘사와 효사)입니다.

[원문]
${text}

이 괘의 괘사(卦辭)와 각 효사(爻辭)별로, 다음 7명의 학자들의 주석을 각각 작성해주세요:
1. 왕필 (Wang Bi)
2. 공영달 (Kong Yingda)
3. 소식 (Su Shi)
4. 정이 (Cheng Yi)
5. 주희 (Zhu Xi)
6. 쌍호호씨 (Shuanghu Hu Shi)
7. 운봉호씨 (Yunfeng Hu Shi)

반드시 다음 JSON 배열(Array) 형식으로만 반환하세요:
[
  {
    "title": "괘사",
    "wangbi": "왕필의 해석",
    "kongyingda": "공영달의 해석",
    "sushi": "소식의 해석",
    "chengyi": "정이의 해석",
    "zhuxi": "주희의 해석",
    "shuanghu": "쌍호호씨의 해석",
    "yunfeng": "운봉호씨의 해석"
  },
  {
    "title": "초효(예: 초구, 초육 등 이름 사용)",
    "wangbi": "...",
    "kongyingda": "...",
    "sushi": "...",
    "chengyi": "...",
    "zhuxi": "...",
    "shuanghu": "...",
    "yunfeng": "..."
  }
  // ... 나머지 2효~상효까지 순차적으로 객체 추가 (총 7개의 객체: 괘사 1개 + 효사 6개)
]
결과는 오직 유효한 JSON 배열 형식으로만 반환해야 합니다. 마크다운 블록(\`\`\`json) 없이 순수 JSON 문자열만 반환하거나 마크다운 블록을 사용해도 파싱할 수 있게 해주세요. 다른 말은 덧붙이지 마세요.
`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    
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
    console.error('Iching API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
