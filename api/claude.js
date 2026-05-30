export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens } = req.body;

    // Build prompt in Ollama format
    const systemPrompt = system ? `${system}\n\n` : '';
    const conversation = messages.map(m => 
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n');
    const fullPrompt = `${systemPrompt}${conversation}\nAssistant:`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: fullPrompt,
        stream: false,
        options: { num_predict: max_tokens || 1000 }
      }),
    });

    const data = await response.json();
    
    // Return in Anthropic-compatible format so App.jsx doesn't need changes
    res.status(200).json({
      content: [{ type: 'text', text: data.response }]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
