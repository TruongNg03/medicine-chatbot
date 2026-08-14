export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // GET /medicines
    if (request.method === "GET" && url.pathname === "/medicines")
      return await getMedicines(url, env);

    // GET /medicines/:id
    if (request.method === "GET" && url.pathname.startsWith("/medicines/")) {
      const id = url.pathname.split("/")[2];
      return await getOneMedicine(id, env);
    }

    // POST /medicines/create
    if (request.method === "POST" && url.pathname === "/medicines/create") {
      return await createMedicine(request, env);
    }

    // PUT /medicines/update/:id
    if (
      request.method === "PUT" &&
      url.pathname.startsWith("/medicines/update/")
    ) {
      const id = url.pathname.split("/")[3];
      return await updateMedicine(id, request, env);
    }

    if (
      request.method === "DELETE" &&
      url.pathname === "/medicines/delete-many"
    ) {
      return await deleteMedicines(request, env);
    }

    // POST / (call to ai chatbot)
    if (request.method === "POST" && url.pathname === "/create")
      return await getChatbotResponse(request, env);

    return new Response(
      JSON.stringify({
        error: "Not found",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
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

// get chatbot response
async function getChatbotResponse(request, env) {
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
}

// get data from db
async function findMedicines(
  env,
  { search, page, pageSize, orderBy, orderType },
) {
  const value = search?.trim().toLowerCase() ?? "";
  const offset = (page - 1) * pageSize;
  const allowedOrderBy = [
    "id",
    "hoat_chat",
    "biet_duoc",
    "nhom_tac_dung",
    "ham_luong",
    "dang_bao_che",
    "dong_goi",
    "updated_at",
  ];

  let orderClause = "";
  if (orderBy && allowedOrderBy.includes(orderBy)) {
    const safeOrderType = orderType?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    orderClause = `ORDER BY ${orderBy} ${safeOrderType}`;
  }

  let countResult;
  let dataResult;

  if (value) {
    const keyword = `%${value}%`;

    countResult = await env.MEDICARE_AI_DB.prepare(
      `
        SELECT COUNT(*) AS count
        FROM medicines
        WHERE
          LOWER(hoat_chat) LIKE ? OR
          LOWER(biet_duoc) LIKE ?
      `,
    )
      .bind(keyword, keyword)
      .first();

    dataResult = await env.MEDICARE_AI_DB.prepare(
      `
        SELECT *
        FROM medicines
        WHERE
          LOWER(hoat_chat) LIKE ? OR
          LOWER(biet_duoc) LIKE ?
        ${orderClause}
        LIMIT ? OFFSET ?
      `,
    )
      .bind(keyword, keyword, pageSize, offset)
      .all();
  } else {
    countResult = await env.MEDICARE_AI_DB.prepare(
      `SELECT COUNT(*) AS count FROM medicines`,
    ).first();

    dataResult = await env.MEDICARE_AI_DB.prepare(
      `SELECT * FROM medicines ${orderClause} LIMIT ? OFFSET ?`,
    )
      .bind(pageSize, offset)
      .all();
  }

  return {
    count: Number(countResult?.count ?? 0),
    page,
    pageSize,
    items: dataResult?.results ?? [],
  };
}

async function getMedicines(url, env) {
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get("pageSize")) || 10, 1),
    100,
  );
  const orderBy = url.searchParams.get("orderBy");
  const orderType = url.searchParams.get("orderType") ?? "DESC";

  try {
    const result = await findMedicines(env, {
      search,
      page,
      pageSize,
      orderBy,
      orderType,
    });

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
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

// get one from db
async function findMedicineById(env, id) {
  return await env.MEDICARE_AI_DB.prepare(
    `
    SELECT *
    FROM medicines
    WHERE id = ?
    LIMIT 1
  `,
  )
    .bind(id)
    .first();
}

async function createMedicine(request, env) {
  try {
    const body = await request.json();

    const allowedFields = [
      "hoat_chat",
      "biet_duoc",
      "nhom_tac_dung",
      "ham_luong",
      "dang_bao_che",
      "dong_goi",
      "chi_dinh",
      "lieu_dung",
      "cach_dung",
      "chong_chi_dinh",
      "tuong_tac_thuoc",
      "tac_dung_khong_mong_muon",
      "duoc_dong_hoc_duoc_luc_hoc",
      "luu_y",
      "tai_lieu_tham_khao",
    ];

    const fields = [];
    const placeholders = [];
    const values = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        fields.push(field);
        placeholders.push("?");
        values.push(body[field] ?? "");
      }
    }

    if (!fields.length) {
      return new Response(
        JSON.stringify({
          error: "No data to create",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    const result = await env.MEDICARE_AI_DB.prepare(
      `
        INSERT INTO medicines (
          ${fields.join(", ")}
        )
        VALUES (
          ${placeholders.join(", ")}
        )
      `,
    )
      .bind(...values)
      .run();

    const id = result.meta?.last_row_id;

    const medicine = await findMedicineById(env, id);

    return new Response(JSON.stringify(medicine), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
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

async function getOneMedicine(id, env) {
  const medicineId = Number(id);
  if (!Number.isInteger(medicineId) || medicineId <= 0) {
    return new Response(
      JSON.stringify({
        error: "Invalid medicine id",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  try {
    const medicine = await findMedicineById(env, id);

    if (!medicine) {
      return new Response(
        JSON.stringify({
          error: "Medicine not found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    return new Response(JSON.stringify(medicine), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
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

async function updateMedicine(id, request, env) {
  if (!id) {
    return new Response(
      JSON.stringify({
        error: "Medicine id is required",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  try {
    const body = await request.json();

    const allowedFields = [
      "hoat_chat",
      "biet_duoc",
      "nhom_tac_dung",
      "ham_luong",
      "dang_bao_che",
      "dong_goi",
      "chi_dinh",
      "lieu_dung",
      "cach_dung",
      "chong_chi_dinh",
      "tuong_tac_thuoc",
      "tac_dung_khong_mong_muon",
      "duoc_dong_hoc_duoc_luc_hoc",
      "luu_y",
      "tai_lieu_tham_khao",
    ];

    const fields = [];
    const values = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        fields.push(`${field} = ?`);
        values.push(body[field] ?? "");
      }
    }

    if (!fields.length) {
      return new Response(
        JSON.stringify({
          error: "No fields to update",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");

    values.push(id);

    await env.MEDICARE_AI_DB.prepare(
      `
        UPDATE medicines
        SET ${fields.join(", ")}
        WHERE id = ?
      `,
    )
      .bind(...values)
      .run();

    const medicine = await findMedicineById(env, id);

    if (!medicine) {
      return new Response(
        JSON.stringify({
          error: "Medicine not found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    return new Response(JSON.stringify(medicine), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
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

async function deleteMedicines(request, env) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    if (!ids.length) {
      return new Response(
        JSON.stringify({
          error: "ids must be a non-empty array",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    const validIds = ids.map(Number);
    const hasInvalidId = validIds.some(
      (id) => !Number.isInteger(id) || id <= 0,
    );

    if (hasInvalidId) {
      return new Response(
        JSON.stringify({
          error: "All ids must be positive integers",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    // Remove duplicate ids
    const uniqueIds = [...new Set(validIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    // Check existing ids
    const result = await env.MEDICARE_AI_DB.prepare(
      `
        SELECT id
        FROM medicines
        WHERE id IN (${placeholders})
      `,
    )
      .bind(...uniqueIds)
      .all();

    const existingIds = result.results.map((item) => Number(item.id));

    // Find ids that don't exist
    const missingIds = uniqueIds.filter((id) => !existingIds.includes(id));

    if (missingIds.length) {
      return new Response(
        JSON.stringify({
          error: "Some medicine ids were not found",
          missingIds,
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    // Delete
    const deleteResult = await env.MEDICARE_AI_DB.prepare(
      `
        DELETE FROM medicines
        WHERE id IN (${placeholders})
      `,
    )
      .bind(...uniqueIds)
      .run();

    const count = deleteResult.meta?.changes ?? 0;

    return new Response(
      JSON.stringify({
        message: `Deleted ${count} medicine${
          count !== 1 ? "s" : ""
        } successfully`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
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
