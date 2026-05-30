import express from 'express';
import { createServer } from 'vite';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// Proxy route for Ollama
app.post('/api/claude', async (req, res) => {
  try {
    const { messages, system, max_tokens } = req.body;

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
    res.json({ content: [{ type: 'text', text: data.response }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend
app.use(express.static('dist'));

app.listen(3000, () => {
  console.log('✓ Knowledgebase running at http://localhost:3000');
});
