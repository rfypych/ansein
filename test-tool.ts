import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function test() {
  const result = await streamText({
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat('gpt-4o-mini'),
    messages: [
      { role: 'user', content: 'Coba web search info publik tentang WormGPT' }
    ],
    tools: {
      search_web: tool({
        description: 'Search the web using Wikipedia',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          console.log('[EXECUTING TOOL] search_web', query);
          return { result: 'WormGPT is an AI.' };
        }
      })
    },
    maxSteps: 5,
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }
}
test().catch(console.error);
