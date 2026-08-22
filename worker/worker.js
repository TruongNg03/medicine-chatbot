import * as XLSX from "xlsx";

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

    // POST /medicines/import-file
    if (
      request.method === "POST" &&
      url.pathname === "/medicines/import-file"
    ) {
      return await importMedicinesFile(request, env);
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

    // POST /chatbot (call to ai chatbot)
    if (request.method === "POST" && url.pathname === "/chatbot")
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
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_OPTIONS.MODEL_AI.GEMINI}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT,
            },
          ],
        },
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
        model: DEFAULT_OPTIONS.MODEL_AI.GROQ,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
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

async function askOpenRouter(message, env) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_OPTIONS.MODEL_AI.OPENROUTER,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
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
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? // gemini
    data?.choices?.[0]?.message?.content // groq, openrouter
  );
}

function getErrorMessage(error, typeAI) {
  if (
    typeAI === DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI &&
    error?.code === 429
  ) {
    const tryTime = getTryTime(error?.message);
    return (
      "Bạn đã vượt quá hạn mức (quota) hiện tại." +
      (tryTime ? `Vui lòng thử lại sau ${tryTime} giây.` : "")
    );
  }

  return error?.message;
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
  try {
    const { message } = await request.json();

    const allErrorMessages = {};

    const aiProviders = [
      {
        type: DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GEMINI,
        ask: askGemini,
      },
      {
        type: DEFAULT_OPTIONS.DEFAULT_TYPE_AI.GROQ,
        ask: askGroq,
      },
      {
        type: DEFAULT_OPTIONS.DEFAULT_TYPE_AI.OPENROUTER,
        ask: askOpenRouter,
      },
    ];

    let typeAI, data, successChatbotName;

    for (const provider of aiProviders) {
      const res = await provider.ask(message, env);

      data = res.data;

      if (res.ok) {
        typeAI = provider.type;
        successChatbotName = provider.type;
        break;
      }

      allErrorMessages[provider.type] = getErrorMessage(
        data?.error,
        provider.type,
      );
    }

    const reply =
      getSuccessMessage(data) ??
      getErrorMessage(data?.error, typeAI) ??
      DEFAULT_OPTIONS.DEFAULT_MESSAGE;

    return new Response(
      JSON.stringify({
        reply,
        allErrorMessages,
        successChatbotName: successChatbotName ?? "none",
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

    return new Response(JSON.stringify({ body: result }), {
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

    return new Response(
      JSON.stringify({
        body: { item: medicine, message: "Medicine created successfully" },
      }),
      {
        status: 201,
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

    return new Response(JSON.stringify({ body: { item: medicine } }), {
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

    return new Response(
      JSON.stringify({
        body: { item: medicine, message: "Medicine updated successfully" },
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
        body: {
          message: `Deleted ${count} medicine${
            count !== 1 ? "s" : ""
          } successfully`,
        },
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

async function importMedicinesFile(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // 1. CHECK FILE
    if (!file || typeof file.arrayBuffer !== "function") {
      return jsonResponse(
        {
          success: false,
          message: "Không tìm thấy file Excel.",
        },
        400,
      );
    }

    const fileName = String(file.name ?? "")
      .toLowerCase()
      .trim();

    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return jsonResponse(
        {
          success: false,
          message: "Chỉ hỗ trợ file Excel .xlsx hoặc .xls.",
        },
        400,
      );
    }

    // 2. READ EXCEL
    let workbook;

    try {
      const arrayBuffer = await file.arrayBuffer();

      workbook = XLSX.read(arrayBuffer, {
        type: "array",
      });
    } catch (error) {
      console.error("Read Excel error:", error);

      return jsonResponse(
        {
          success: false,
          message: "File Excel không hợp lệ hoặc bị hỏng.",
        },
        400,
      );
    }

    // 3. CHECK SHEET
    if (!workbook?.SheetNames?.length) {
      return jsonResponse(
        {
          success: false,
          message: "File Excel không có sheet.",
        },
        400,
      );
    }

    // Lấy sheet đầu tiên
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return jsonResponse(
        {
          success: false,
          message: "Không thể đọc sheet Excel.",
        },
        400,
      );
    }

    // 4. RAW ROWS
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    if (!rows.length) {
      return jsonResponse(
        {
          success: false,
          message: "File Excel không có dữ liệu.",
        },
        400,
      );
    }

    if (rows.length < 3) {
      return jsonResponse(
        {
          success: false,
          message:
            "File Excel phải có ít nhất 3 dòng: key, tên field và dữ liệu.",
        },
        400,
      );
    }

    // 5. GET HEADER
    const rawKeys = Array.isArray(rows[0]) ? rows[0] : [];
    const fieldNames = Array.isArray(rows[1]) ? rows[1] : [];

    if (!rawKeys.length) {
      return jsonResponse(
        {
          success: false,
          message: "Không tìm thấy dòng key trong file Excel.",
        },
        400,
      );
    }

    if (!fieldNames.length) {
      return jsonResponse(
        {
          success: false,
          message: "Không tìm thấy dòng tên field trong file Excel.",
        },
        400,
      );
    }

    // 6. DATA ROWS
    const dataRows = rows.slice(2);

    // 7. NORMALIZE KEYS
    const keys = rawKeys.map((key) =>
      String(key ?? "")
        .trim()
        .toLowerCase(),
    );

    // 8. ALLOWED KEYS
    const allowedKeys = [
      "biet_duoc",
      "hoat_chat",
      "dang_bao_che",
      "duong_tiem",
      "nhom_tac_dung",
      "chong_chi_dinh",
      "lieu_toi_da",
      "dung_moi",
      "thoi_gian_tiem",
      "luu_y",
      "tuong_ky",
      "hinh_anh",
    ];

    // 9. CHECK EMPTY KEY
    const emptyKeyIndex = keys.findIndex((key) => !key);

    if (emptyKeyIndex !== -1) {
      return jsonResponse(
        {
          success: false,
          message: `Key ở cột ${emptyKeyIndex + 1} không được để trống.`,
        },
        400,
      );
    }

    // 10. CHECK DUPLICATE KEY
    const duplicatedKeys = [
      ...new Set(keys.filter((key, index) => keys.indexOf(key) !== index)),
    ];

    if (duplicatedKeys.length) {
      return jsonResponse(
        {
          success: false,
          message: `Key bị trùng: ${duplicatedKeys.join(", ")}`,
        },
        400,
      );
    }

    // 11. CHECK UNKNOWN KEY
    const invalidKeys = [
      ...new Set(keys.filter((key) => !allowedKeys.includes(key))),
    ];

    if (invalidKeys.length) {
      return jsonResponse(
        {
          success: false,
          message: `Key không hợp lệ: ${invalidKeys.join(", ")}`,
        },
        400,
      );
    }

    // 12. CHECK REQUIRED KEYS
    const requiredKeys = ["biet_duoc", "hoat_chat"];

    const missingRequiredKeys = requiredKeys.filter(
      (key) => !keys.includes(key),
    );

    if (missingRequiredKeys.length) {
      return jsonResponse(
        {
          success: false,
          message: `Thiếu key bắt buộc: ${missingRequiredKeys.join(", ")}`,
        },
        400,
      );
    }

    // 13. CONVERT ROW -> OBJECT + VALIDATE DATA
    const medicines = [];
    const errors = [];

    dataRows.forEach((row, rowIndex) => {
      const excelRowNumber = rowIndex + 3;

      // Bỏ qua row hoàn toàn rỗng
      const isEmptyRow = row.every(
        (value) => String(value ?? "").trim() === "",
      );

      if (isEmptyRow) {
        return;
      }

      const medicine = {};

      keys.forEach((key, columnIndex) => {
        const value = String(row[columnIndex] ?? "").trim();

        medicine[key] = value;
      });

      // REQUIRED DATA
      if (!medicine.biet_duoc) {
        errors.push({
          row: excelRowNumber,
          message: "Thiếu biệt dược.",
        });

        return;
      }

      if (!medicine.hoat_chat) {
        errors.push({
          row: excelRowNumber,
          message: "Thiếu hoạt chất.",
        });

        return;
      }

      medicines.push(medicine);
    });

    // 14. NO VALID DATA
    if (!medicines.length) {
      return jsonResponse(
        {
          success: false,
          message: "Không có dữ liệu hợp lệ để import.",
          count: 0,
          errors,
        },
        400,
      );
    }

    // 15. PREPARE INSERT STATEMENTS
    const statements = medicines.map((medicine) =>
      env.MEDICARE_AI_DB.prepare(
        `
          INSERT INTO medicines (
            biet_duoc,
            hoat_chat,
            dang_bao_che,
            duong_tiem,
            nhom_tac_dung,
            chong_chi_dinh,
            lieu_toi_da,
            dung_moi,
            thoi_gian_tiem,
            luu_y,
            tuong_ky,
            hinh_anh
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        medicine.biet_duoc,
        medicine.hoat_chat,
        medicine.dang_bao_che,
        medicine.duong_tiem,
        medicine.nhom_tac_dung,
        medicine.chong_chi_dinh,
        medicine.lieu_toi_da,
        medicine.dung_moi,
        medicine.thoi_gian_tiem,
        medicine.luu_y,
        medicine.tuong_ky,
        medicine.hinh_anh,
      ),
    );

    // 16. BATCH INSERT
    const BATCH_SIZE = 100;

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);

      await env.MEDICARE_AI_DB.batch(batch);
    }

    // 17. RESPONSE
    return jsonResponse({
      success: true,
      message: `Import thành công ${medicines.length} thuốc.`,
      count: medicines.length,
      errors,
    });
  } catch (error) {
    console.error("Import medicines error:", error);

    return jsonResponse(
      {
        success: false,
        message: "Import Excel thất bại.",
        error: String(error),
      },
      500,
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

const SYSTEM_PROMPT = `
Bạn là trợ lý AI.

Luôn trả lời bằng tiếng Việt.
Không sử dụng tiếng Anh nếu không cần thiết.
Nếu thuật ngữ chuyên môn bắt buộc phải dùng tiếng Anh, hãy giữ thuật ngữ đó và giải thích bằng tiếng Việt.
`;

const DEFAULT_OPTIONS = {
  BASE_URL: "/api",
  DEFAULT_MESSAGE: "Không có phản hồi.",
  DEFAULT_TYPE_AI: {
    GEMINI: "gemini",
    GROQ: "groq",
    OPENROUTER: "openrouter",
  },
  MODEL_AI: {
    GEMINI: "gemini-3.6-flash", // gemini-3.6-flash
    GROQ: "openai/gpt-oss-120b", // llama-3.3-70b-versatile (deleted), openai/gpt-oss-20b, openai/gpt-oss-120b
    OPENROUTER: "openrouter/free", // openrouter/free
  },
};
