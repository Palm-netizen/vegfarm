// supabase/functions/ai-knowledge/index.ts
//
// Optional Edge Function ที่ให้ Claude (Anthropic API) ช่วย "ค้นหาด้วย AI" และ
// "เชื่อมโยงความรู้" เชิงเนื้อหาแบบเข้าใจภาษาธรรมชาติ จริง ๆ
// ถ้าไม่ deploy ฟังก์ชันนี้ แอปจะยัง fallback ไปค้นหา/จัดกลุ่มด้วยคำสำคัญ+แท็กได้ตามปกติ
//
// Deploy:
//   supabase functions deploy ai-knowledge --no-verify-jwt
// ตั้งค่า secret (ขอ API key ได้ที่ https://console.anthropic.com):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function askClaude(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

function extractJSON(text: string) {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON found in model response');
  return JSON.parse(match[0]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, query } = await req.json();

    const { data: notes, error } = await supabase
      .from('notes')
      .select('id, book_title, read_date, highlights, insight, action, tags')
      .order('read_date', { ascending: false })
      .limit(300);
    if (error) throw error;

    if (action === 'search') {
      const catalogue = notes.map((n) => ({
        id: n.id, book: n.book_title, highlights: n.highlights, insight: n.insight, action: n.action, tags: n.tags,
      }));
      const text = await askClaude(
        'You are a helpful research assistant for a personal reading-notes app. Given a user query (Thai or English) ' +
        'and a JSON catalogue of notes, return ONLY a JSON array (no prose, no markdown fences) of the most relevant notes: ' +
        '[{"id": "...", "reason": "short Thai explanation of why it matches"}]. Return at most 10 items, most relevant first. ' +
        'If nothing matches, return [].',
        `คำค้นหา: ${query}\n\nรายการบันทึก:\n${JSON.stringify(catalogue)}`
      );
      const results = extractJSON(text);
      return new Response(JSON.stringify({ results }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (action === 'connections') {
      const catalogue = notes.map((n) => ({
        book: n.book_title, insight: n.insight, action: n.action, tags: n.tags, highlights: n.highlights,
      }));
      const text = await askClaude(
        'You are analyzing a personal reading-notes library to find conceptual connections between different books. ' +
        'Given a JSON catalogue of notes (each tied to a book), return ONLY a JSON array (no prose, no markdown fences) of connections: ' +
        '[{"concept": "short Thai label for the shared idea", "books": ["Book A", "Book B"], "explanation": "1-2 Thai sentences on how the books connect"}]. ' +
        'Only include a connection when at least 2 DIFFERENT books share it. Return at most 8 connections.',
        `รายการบันทึกทั้งหมด:\n${JSON.stringify(catalogue)}`
      );
      const connections = extractJSON(text);
      return new Response(JSON.stringify({ connections }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
