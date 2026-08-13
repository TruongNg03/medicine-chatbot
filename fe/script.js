async function sendMessage() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  // Hiển thị tin nhắn người dùng
  appendMessage(text, "user");
  input.value = "";
  // Tạo bong bóng chờ cho Bot
  const loadingId = appendMessage("Đang suy nghĩ...", "bot");

  try {
    const response = await fetch(
      "https://medicare-chatbot.evilgodashtal.workers.dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
        }),
      },
    );

    const data = await response.json();

    if (data.reply) {
      document.getElementById(loadingId).innerText = data.reply;
    } else {
      document.getElementById(loadingId).innerText =
        "Xin lỗi, hiện tại hệ thống không thể xử lý câu hỏi.";
    }
  } catch (error) {
    document.getElementById(loadingId).innerText =
      "Không thể kết nối đến server AI. Vui lòng kiểm tra lại kết nối!";
  }
}

function appendMessage(text, side) {
  const chatBox = document.getElementById("chatBox");
  const row = document.createElement("div");
  row.className = `message-row ${side}`;

  const msgId = "msg-" + Date.now();

  if (side === "bot") {
    row.innerHTML = `<div class="avatar">AI</div><div class="bubble" id="${msgId}">${text}</div>`;
  } else {
    row.innerHTML = `<div class="bubble">${text}</div><div class="avatar user-avt">B</div>`;
  }

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgId;
}
