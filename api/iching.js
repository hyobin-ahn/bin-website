module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, text, title } = req.body || {};

  if (!name || !text || !title) {
    return res.status(400).json({ error: 'Missing name, title, or text parameter in JSON body' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in environment variables' });
  }

  const prompt = `
당신은 주역(I Ching)에 정통한 동양철학자입니다.
다음은 주역의 '${name}' 괘 중 '${title}' 부분의 원문입니다.

[원문]
${text}

이 원문에 대해, 다음 7명의 학자들의 주석을 각각 작성해주세요:
1. 왕필 (Wang Bi)
2. 공영달 (Kong Yingda)
3. 소식 (Su Shi)
4. 정이 (Cheng Yi)
5. 주희 (Zhu Xi)
6. 쌍호호씨 (Shuanghu Hu Shi)
7. 운봉호씨 (Yunfeng Hu Shi)

모든 주석의 문장 끝은 반드시 '~이다', '~한다', '~다'와 같은 평어체(해라체)로 번역하세요. '~습니다', '~합니다'와 같은 존댓말은 절대 사용하지 마세요.
또한, 주석가의 원문을 임의로 의역하거나 풀어서 설명하지 말고, 최대한 원문의 형태와 뉘앙스를 살려 직역(literal translation)에 가깝게 번역하세요.
가장 중요한 규칙: 반드시 각 학자가 해당 원문에 대해 실제로 남긴 역사적 원문(한문)만을 기억해내어 번역해야 합니다. 학자가 하지 않은 일반적인 해설을 덧붙이거나, 단전/상전 등 다른 글을 섞어서 지어내면 절대 안 됩니다.

반드시 다음 JSON 단일 객체(Object) 형식으로만 반환하세요:
{
  "title": "${title}",
  "wangbi": "왕필의 해석",
  "kongyingda": "공영달의 해석",
  "sushi": "소식의 해석",
  "chengyi": "정이의 해석",
  "zhuxi": "주희의 해석",
  "shuanghu": "쌍호호씨의 해석",
  "yunfeng": "운봉호씨의 해석"
}
결과는 오직 유효한 JSON 형식으로만 반환해야 합니다. 마크다운 블록(\`\`\`json) 없이 순수 JSON 문자열만 반환하거나 마크다운 블록을 사용해도 파싱할 수 있게 해주세요. 다른 말은 덧붙이지 마세요.
`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    
    let response;
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.4
          }
        })
      });

      if (response.ok) {
        data = await response.json();
        break;
      }

      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || '구글 AI 무료 사용량 제한(1분당 20회)을 초과했습니다. 잠시 후 다시 시도해주세요.');
      }

      if (attempt === 2) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
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
