const API_URL = "https://medicare-chatbot.evilgodashtal.workers.dev/medicines";
const searchInput = document.getElementById("searchInput");
const tableBody = document.getElementById("medicineTableBody");
const totalCount = document.getElementById("totalCount");
const modal = document.getElementById("medicineModal");
const form = document.getElementById("medicineForm");
const pageSelect = document.getElementById("pageSelect");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const orderBySelect = document.getElementById("orderBySelect");
const orderTypeSelect = document.getElementById("orderTypeSelect");

let currentPage = 1;
let totalItems = 0;
let pageSize = 20;
let orderBy = "";
let orderType = "DESC";

// GET
async function loadMedicines(page = currentPage) {
  const keyword = searchInput.value.trim();

  try {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-gray-400">
          <i class="fa-solid fa-spinner fa-spin text-xl"></i>
          <p class="mt-2">Đang tải...</p>
        </td>
      </tr>
    `;

    const params = new URLSearchParams({
      search: keyword,
      page: String(page),
      pageSize: String(pageSize),
    });

    if (orderBy) {
      params.set("orderBy", orderBy);
      params.set("orderType", orderType);
    }

    const response = await fetch(`${API_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    currentPage = result?.body?.page ?? page;
    totalItems = result?.body?.count ?? 0;
    pageSize = Number(result?.body?.pageSize ?? pageSize);
    pageSizeSelect.value = String(pageSize);

    renderPagination();
    renderTable(result?.body?.items ?? []);
  } catch (error) {
    console.log(error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-red-500">
          Không thể tải dữ liệu.
        </td>
      </tr>
    `;
  }
}

// TABLE
function renderTable(data) {
  totalCount.innerText = `${totalItems} thuốc`;

  if (!data.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-box-open text-3xl mb-2"></i>
          <p>Không có dữ liệu.</p>
        </td>
      </tr>
    `;

    return;
  }

  const startIndex = (currentPage - 1) * pageSize;

  tableBody.innerHTML = data
    .map(
      (item, index) => `
        <tr class="border-b last:border-0 hover:bg-blue-50/40 transition">
          <td class="px-4 py-3 text-gray-400">
            ${startIndex + index + 1}
          </td>

          <td class="px-4 py-3">
            <div class="font-bold text-custom-blue">
              ${escapeHtml(item.biet_duoc)}
            </div>
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.hoat_chat)}
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.dang_bao_che)}
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.nhom_tac_dung)}
          </td>

          <td class="px-4 py-3">
            <div class="max-w-[300px] max-h-24 overflow-y-auto whitespace-pre-line">
              ${escapeHtml(item.chong_chi_dinh)}
            </div>
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.lieu_toi_da)}
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.dung_moi)}
          </td>

          <td class="px-4 py-3">
            ${escapeHtml(item.thoi_gian_tiem)}
          </td>

          <td class="px-4 py-3">
            <div class="max-w-[300px] max-h-24 overflow-y-auto whitespace-pre-line">
              ${escapeHtml(item.luu_y)}
            </div>
          </td>

          <td class="px-4 py-3">
            <div class="max-w-[300px] max-h-24 overflow-y-auto whitespace-pre-line">
              ${escapeHtml(item.tuong_ky)}
            </div>
          </td>

          <td class="px-4 py-3">
            ${
              item.hinh_anh
                ? `
                  <img
                    src="${escapeHtml(item.hinh_anh)}"
                    alt="${escapeHtml(item.biet_duoc)}"
                    class="w-16 h-16 object-cover rounded-lg border"
                  />
                `
                : `
                  <span class="text-gray-400">
                    Không có ảnh
                  </span>
                `
            }
          </td>

          <td class="px-4 py-3">
            <div class="flex justify-center gap-2">
              <button
                onclick='openEditModal(${JSON.stringify(item)})'
                class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                title="Sửa"
              >
                <i class="fa-solid fa-pen"></i>
              </button>

              <button
                onclick="deleteMedicine([${item.id}])"
                class="w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                title="Xóa"
              >
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderPagination() {
  let totalPages = Math.ceil(totalItems / pageSize);
  pageSelect.innerHTML = "";

  if (totalPages <= 0) totalPages = 1;

  for (let page = 1; page <= totalPages; page++) {
    const option = document.createElement("option");
    option.value = page;
    option.textContent = `Trang ${page}`;

    if (page === currentPage) option.selected = true;

    pageSelect.appendChild(option);
  }
}

function renderPageSizeSelect() {
  pageSizeSelect.innerHTML = "";

  for (let size = 10; size <= 100; size += 10) {
    const option = document.createElement("option");
    option.value = size;
    option.textContent = `${size} / trang`;

    if (size === pageSize) option.selected = true;

    pageSizeSelect.appendChild(option);
  }
}

function renderOrderBySelect() {
  const options = [
    {
      value: "",
      label: "Không sắp xếp",
    },
    {
      value: "hoat_chat",
      label: "Hoạt chất",
    },
    {
      value: "biet_duoc",
      label: "Biệt dược",
    },
    {
      value: "nhom_tac_dung",
      label: "Nhóm tác dụng",
    },
    {
      value: "ham_luong",
      label: "Hàm lượng",
    },
    {
      value: "dang_bao_che",
      label: "Dạng bào chế",
    },
    {
      value: "updated_at",
      label: "Ngày cập nhật",
    },
  ];

  orderBySelect.innerHTML = options
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");

  orderBySelect.value = orderBy;
}

function renderOrderTypeSelect() {
  orderTypeSelect.innerHTML = `
    <option value="ASC">Tăng dần</option>
    <option value="DESC">Giảm dần</option>
  `;

  orderTypeSelect.value = orderType;
}

// change page
pageSelect.addEventListener("change", function () {
  currentPage = Number(this.value);
  loadMedicines(currentPage);
});

// change page size
pageSizeSelect.addEventListener("change", function () {
  pageSize = Number(this.value);
  currentPage = 1;
  loadMedicines();
});

// change order by
orderBySelect.addEventListener("change", function () {
  orderBy = this.value;
  currentPage = 1;
  loadMedicines();
});

//change order type
orderTypeSelect.addEventListener("change", function () {
  orderType = this.value;
  currentPage = 1;
  loadMedicines();
});

// CREATE
function openCreateModal() {
  form.reset();

  document.getElementById("medicineId").value = "";
  document.getElementById("modalTitle").innerText = "Thêm thuốc";

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// EDIT
function openEditModal(item) {
  document.getElementById("medicineId").value = item.id ?? "";
  document.getElementById("bietDuoc").value = item.biet_duoc ?? "";
  document.getElementById("hoatChat").value = item.hoat_chat ?? "";
  document.getElementById("dangBaoChe").value = item.dang_bao_che ?? "";
  document.getElementById("duongTiem").value = item.duong_tiem ?? "";
  document.getElementById("nhomTacDung").value = item.nhom_tac_dung ?? "";
  document.getElementById("chongChiDinh").value = item.chong_chi_dinh ?? "";
  document.getElementById("lieuToiDa").value = item.lieu_toi_da ?? "";
  document.getElementById("dungMoi").value = item.dung_moi ?? "";
  document.getElementById("thoiGianTiem").value = item.thoi_gian_tiem ?? "";
  document.getElementById("luuY").value = item.luu_y ?? "";
  document.getElementById("tuongKy").value = item.tuong_ky ?? "";
  document.getElementById("hinhAnh").value = item.hinh_anh ?? "";
  document.getElementById("modalTitle").innerText = "Chỉnh sửa thuốc";

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

// CLOSE MODAL
function closeModal() {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// CREATE / UPDATE form modal
form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const id = document.getElementById("medicineId").value;

  const data = {
    hoat_chat: document.getElementById("hoatChat").value.trim(),
    biet_duoc: document.getElementById("bietDuoc").value.trim(),
    dang_bao_che: document.getElementById("dangBaoChe").value.trim(),
    duong_tiem: document.getElementById("duongTiem").value.trim(),
    nhom_tac_dung: document.getElementById("nhomTacDung").value.trim(),
    chong_chi_dinh: document.getElementById("chongChiDinh").value.trim(),
    lieu_toi_da: document.getElementById("lieuToiDa").value.trim(),
    dung_moi: document.getElementById("dungMoi").value.trim(),
    thoi_gian_tiem: document.getElementById("thoiGianTiem").value.trim(),
    luu_y: document.getElementById("luuY").value.trim(),
    tuong_ky: document.getElementById("tuongKy").value.trim(),
    hinh_anh: document.getElementById("hinhAnh").value.trim(),
  };

  try {
    if (!id) {
      await createMedicine(data);
      alert("Thêm thuốc thành công!");
    } else {
      await updateMedicine(id, data);
      alert("Cập nhật thuốc thành công!");
    }

    closeModal();
    await loadMedicines();
  } catch (error) {
    console.error(error);
    alert("Có lỗi xảy ra khi lưu dữ liệu.");
  }
});

// CREATE
async function createMedicine(data) {
  const response = await fetch(`${API_URL}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}

// UPDATE
async function updateMedicine(id, data) {
  if (!id) {
    throw new Error("Medicine ID is required");
  }

  const response = await fetch(`${API_URL}/update/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}

// DELETE
async function deleteMedicine(ids) {
  if (!ids) return;

  const confirmed = confirm("Bạn có chắc muốn xóa thuốc này?");
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/delete-many`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await loadMedicines();
    alert("Xóa thuốc thành công!");
  } catch (error) {
    console.error(error);
    alert("Có lỗi xảy ra khi xóa thuốc.");
  }
}

// ESCAPE HTML
function escapeHtml(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ENTER SEARCH
searchInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    loadMedicines();
  }
});

// IMPORT FILE
async function handleExcelFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/import-file`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      alert(result.message ?? "Import Excel thất bại.");
      return;
    }

    alert(
      result.errors?.length
        ? `${result.message}\nCó ${result.errors.length} dòng lỗi.`
        : result.message,
    );

    await loadMedicines();
  } catch (error) {
    console.error("Import Excel error:", error);

    alert("Không thể import file Excel.");
  } finally {
    // Cho phép chọn lại cùng một file
    input.value = "";
  }
}

// INIT
renderPageSizeSelect();
renderOrderBySelect();
renderOrderTypeSelect();
loadMedicines();
