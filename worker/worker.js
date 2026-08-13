export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // get medicine info method
    if (request.method === "GET" && url.pathname === `/medicines`) {
      const keyword = url.searchParams.get("search");

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

    // create many
    const SOURCE_URL =
      "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnRsIDGZbcEufhjZUHevjJ-_irczOucEm1rM5QZxF8bAS2CUU7tGwTq6Y1YrFv6WNCf-U-4WLveyXsHqNbBl3wAE-xf-DEdCyiB9ayMepdJp3Dr8O3bM7NT1AZRpemdpBMJE6SzFvYF1pt8HMpw_i7qKJZ7d1wkU47Yo9tyv6WTTdIgdUQiLL-bNZmzqFhJR0_or84eBgLh-4lY5oKBC8Zhlt9fPvifdcShfCbvmi9xSRgfyM6MXvNeAHbM3rbw3PS6krYlI6HRhOrag3ta5zYSAmBZHyw&lib=MizkqIlUU7544HPz7hXKU6ZMs7zNMImyn";

    if (
      request.method === "GET" &&
      url.pathname === `${BASE_URL}/medicines/import-many`
    ) {
      try {
        const count = await importMedicines(env);

        return new Response(
          JSON.stringify({
            success: true,
            inserted: count,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(),
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: String(error),
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

// use 1 times
async function importMedicines(env) {
  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(`Source API error: ${response.status}`);
  }

  const data = await response.json();

  // Tùy cấu trúc API của bạn
  const items = Array.isArray(data) ? data : data.data;

  if (!Array.isArray(items)) {
    throw new Error("Source data is not an array");
  }

  const statements = items.map((item) => {
    const medicine = {
      hoat_chat: item["HOẠT CHẤT"]?.value ?? null,
      biet_duoc: item["TÊN BIỆT DƯỢC"]?.value ?? null,
      nhom_tac_dung: item["NHÓM DƯỢC LÝ"]?.value ?? null,
      ham_luong: item["HÀM LƯỢNG"]?.value ?? null,
      dang_bao_che: item["DẠNG BÀO CHẾ"]?.value ?? null,
      dong_goi: item["ĐÓNG GÓI"]?.value ?? null,
      chi_dinh: item["CHỈ ĐỊNH"]?.value ?? null,
      lieu_dung: item["LIỀU DÙNG"]?.value ?? null,
      cach_dung: item["CÁCH DÙNG"]?.value ?? null,
      chong_chi_dinh: item["CHỐNG CHỈ ĐỊNH - THẬN TRỌNG"]?.value ?? null,
      tuong_tac_thuoc: item["TƯƠNG TÁC THUỐC"]?.value ?? null,
      tac_dung_khong_mong_muon: item["TÁC DỤNG KHÔNG MONG MUỐN"]?.value ?? null,
      duoc_dong_hoc_duoc_luc_hoc:
        item["DƯỢC ĐỘNG HỌC - DƯỢC LỰC HỌC"]?.value ?? null,
      luu_y: item["LƯU Ý"]?.value ?? null,
      tai_lieu_tham_khao: item["TÀI LIỆU THAM KHẢO CHUẨN HOÁ"]?.value ?? null,
    };

    return env.MEDICARE_AI_DB.prepare(
      `
      INSERT INTO medicines (
        hoat_chat,
        biet_duoc,
        nhom_tac_dung,
        ham_luong,
        dang_bao_che,
        dong_goi,
        chi_dinh,
        lieu_dung,
        cach_dung,
        chong_chi_dinh,
        tuong_tac_thuoc,
        tac_dung_khong_mong_muon,
        duoc_dong_hoc_duoc_luc_hoc,
        luu_y,
        tai_lieu_tham_khao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).bind(
      medicine.hoat_chat,
      medicine.biet_duoc,
      medicine.nhom_tac_dung,
      medicine.ham_luong,
      medicine.dang_bao_che,
      medicine.dong_goi,
      medicine.chi_dinh,
      medicine.lieu_dung,
      medicine.cach_dung,
      medicine.chong_chi_dinh,
      medicine.tuong_tac_thuoc,
      medicine.tac_dung_khong_mong_muon,
      medicine.duoc_dong_hoc_duoc_luc_hoc,
      medicine.luu_y,
      medicine.tai_lieu_tham_khao,
    );
  });

  await env.MEDICARE_AI_DB.batch(statements);

  return items.length;
}

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
  const value = keyword?.trim().toLowerCase();

  if (!value) return [];

  const searchValue = `%${value}%`;
  const result = await env.MEDICARE_AI_DB.prepare(
    `
      SELECT *
      FROM medicines
      WHERE
        LOWER(hoat_chat) LIKE ?
        OR LOWER(ten_biet_duoc) LIKE ?
      ORDER BY updated_at DESC
    `,
  )
    .bind(searchValue, searchValue)
    .all();

  return result.results;
}

// default value
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
}

const DEFAULT_OPTIONS = {
  BASE_URL: "/api",
  DEFAULT_MESSAGE: "Không có phản hồi.",
  DEFAULT_TYPE_AI: {
    GEMINI: "gemini",
    GROQ: "groq",
  },
};
