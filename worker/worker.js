export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (request.method !== "POST") {
      return new Response("Only POST method", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    // get medicine info method
    if (url.pathname === "/api/medicines") {
      const keyword = url.searchParams.get("search") ?? "";

      const medicines = await findMedicines(env, keyword);

      return new Response(
        JSON.stringify({
          data: medicines,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    let typeAI = DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI;

    try {
      const { message } = await request.json();
      let res,
        data,
        allErrorMessages = {};

      res = await askGemini(message, env);
      data = res.data;

      if (!res.ok) {
        allErrorMessages[DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI] =
          getErrorMessage(data?.error, DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI);
      }

      if (!res.ok) {
        typeAI = DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GROQ;
        res = await askGroq(message, env);
        data = res.data;

        if (!res.ok) {
          allErrorMessages[DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GROQ] =
            getErrorMessage(data?.error, DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GROQ);
        }
      }

      const reply =
        getSuccessMessage(data) ??
        getErrorMessage(data?.error, typeAI) ??
        DEFAULT_OPTIONS.DEFAULT_MESSAGE;

      return new Response(
        JSON.stringify({
          reply,
          allErrorMessages,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: String(e),
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }
  },
};

async function askGemini(message, env) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: message,
              },
            ],
          },
        ],
      }),
    },
  );

  const data = await getResponseJson(response);
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function askGroq(message, env) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      }),
    },
  );

  const data = await getResponseJson(response);
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function getSuccessMessage(data) {
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.choices?.[0]?.message?.content
  );
}

function getErrorMessage(error, typeAI) {
  if (typeAI === DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI) {
    if (error?.code === 429) {
      const tryTime = getTryTime(error?.message);
      return (
        "Bạn đã vượt quá hạn mức (quota) hiện tại." +
        (tryTime ? `Vui lòng thử lại sau ${tryTime} giây.` : "")
      );
    }
    return error?.message;
  } else if (typeAI === DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GROQ) {
    return error?.message;
  }

  return;
}

function getTryTime(message) {
  if (!message) return;

  const match = message.match(/retry in ([\d.]+)s/i);
  if (match) return Math.round(Number(match[1]));
}

async function getResponseJson(res) {
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: {
        message: text,
      },
    };
  }
}

// query to db
async function findMedicines(env, keyword) {
  const value = keyword.trim().toLowerCase();

  if (!value) {
    return [];
  }

  const result = await env.MEDICARE_AI_DB.prepare(
    `
      SELECT *
      FROM medicines
      WHERE
        LOWER(hoat_chat) LIKE ? OR
        LOWER(biet_duoc) LIKE ?
      ORDER BY updated_at DESC
    `,
  )
    .bind(`%${value}%`, `%${value}%`)
    .all();

  return result.results;
}

// default value
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const DEFAULT_OPTIONS = {
  DEFAULT_MESSAGE: "Không có phản hồi.",
  DEFAULT_TYPE_AI: {
    GEMINI: "gemini",
    GROQ: "groq",
  },
};
