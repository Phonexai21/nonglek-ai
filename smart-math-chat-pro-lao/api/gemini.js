// api/gemini.js
// 注意: API Key จะถูกเก็บเป็น Environment Variable บน Vercel

export default async function handler(req, res) {
  // ตั้งค่า CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // รับเฉพาะ POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userMessage, systemPrompt } = req.body;

    if (!userMessage) {
      return res.status(400).json({ error: 'userMessage is required' });
    }

    // ดึง API Key จาก Environment Variables (ปลอดภัย!)
    const API_KEY = process.env.GEMINI_API_KEY;
    
    if (!API_KEY) {
      console.error('GEMINI_API_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'API Key not configured. Please set GEMINI_API_KEY in Vercel environment variables.' 
      });
    }

    // รายชื่อ Models (เหมือนเดิม)
    const models = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview", 
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview"
    ];
    
    const version = "v1beta";
    let lastError = "";

    // ลองเรียกแต่ละ model จนกว่าจะสำเร็จ
    for (let model of models) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${API_KEY}`;
      
      const payload = {
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95
        }
      };

      try {
        // ใช้ fetch แทน UrlFetchApp (สำหรับ Node.js environment)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const resCode = response.status;
        const resJson = await response.json();

        if (resCode === 200) {
          if (resJson.candidates && resJson.candidates[0]?.content?.parts[0]?.text) {
            // ส่งคำตอบกลับไปยัง Frontend
            return res.status(200).json({ 
              text: resJson.candidates[0].content.parts[0].text 
            });
          }
        } else {
          lastError = `[${model}] ${resJson.error?.message || "Error " + resCode}`;
          
          // ถ้า Quota เต็ม
          if (resCode === 429) {
            return res.status(429).json({ 
              error: "ຂໍໂທດເດີລູກຮັກ, ຕອນນີ້ມີຄົນຖາມຄູຫຼາຍເກີນໄປ. ກະລຸນາລໍຖ້າ 1 ນາທີ ແລ້ວລອງຖາມໃໝ່ນະລູກ." 
            });
          }
          
          // ถ้า Model ไม่มี หรือไม่รองรับ ให้ลองตัวถัดไป
          if (resCode === 404 || resCode === 400) continue;
          
          // ถ้าเป็น Error อื่นๆ
          return res.status(resCode).json({ error: lastError });
        }
      } catch (e) {
        lastError = e.toString();
        console.error(`Error with model ${model}:`, e);
      }
    }

    // ถ้าลองทุก model แล้วไม่สำเร็จ
    return res.status(500).json({ 
      error: "ຂໍໂທດເດີລູກຮັກ, ຄູບໍ່ສາມາດເຊື່ອມຕໍ່ກັບ AI ລຸ້ນໃໝ່ໄດ້.\nສາເຫດລ່າສຸດ: " + lastError 
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}