import { convertToModelMessages } from 'ai';

async function test() {
  const incomingMessages = [
    { role: 'user', content: 'test web search' },
    {
      role: 'assistant',
      content: 'I will run it',
      toolInvocations: [
        {
          toolCallId: '1',
          toolName: 'search_web',
          args: { query: 'WormGPT' },
          state: 'result',
          result: 'WormGPT is an AI'
        }
      ]
    }
  ];

  const normalized = incomingMessages.map(m => {
    if (m.role === 'user' || m.role === 'system') {
      return { ...m, parts: [{ type: 'text', text: m.content }] };
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      if (m.toolInvocations) {
        for (const t of m.toolInvocations) {
          parts.push({
            type: `tool-${t.toolName}`,
            toolCallId: t.toolCallId,
            toolName: t.toolName,
            state: t.state === 'result' ? 'output-available' : 'input-available',
            input: t.args,
            output: t.result,
            providerExecuted: false
          });
        }
      }
      return { ...m, parts };
    }
    return m;
  });

  try {
    const modelMessages = await convertToModelMessages(normalized);
    console.log(JSON.stringify(modelMessages, null, 2));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

test();
