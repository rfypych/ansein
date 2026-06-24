import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function test() {
  const modelMessages = [
    { role: 'user', content: 'Coba web search info publik tentang WormGPT' }
  ];

  try {
    const result = await streamText({
      model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat('gpt-4o-mini'),
      messages: modelMessages as any,
      tools: {
        search_web: tool({
          description: 'Search the web using Wikipedia',
          parameters: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            console.log('\n[EXECUTING TOOL] search_web', query);
            return { result: 'WormGPT is an AI.' };
          }
        })
      },
      maxSteps: 5,
    });

    const response = result.toUIMessageStreamResponse();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value));
    }
  } catch (err) {
    console.error(err.message);
  }
}
test();
